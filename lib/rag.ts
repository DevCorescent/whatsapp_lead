import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import * as cheerio from "cheerio";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { embedPassages, embedQuery } from "@/lib/embeddings";
import { isDocParseEnabled, parseDocumentToMarkdown } from "@/lib/docparse";
import { ensureCollection, KB_COLLECTION, qdrant } from "@/lib/qdrant";

export type DocType = "TEXT" | "URL" | "PDF" | "DOCX" | "TXT" | "IMAGE";

const DEFAULT_FILENAME: Record<string, string> = {
  PDF: "document.pdf",
  DOCX: "document.docx",
  IMAGE: "image.png",
};

// ─── Text extraction ─────────────────────────────────────────────────────────

/**
 * Pull text out of a raw uploaded file, by type.
 *
 * PDFs, DOCX, and images are routed through LlamaParse when configured — this
 * turns tables into Markdown and OCRs images/scanned pages. If the parser is not
 * configured (or fails) we fall back to local extraction: unpdf for PDFs, mammoth
 * for DOCX. Images have no local fallback (OCR needs the parsing service).
 */
export async function extractDocumentText(
  type: DocType,
  opts: { buffer?: Buffer; url?: string; text?: string; filename?: string },
): Promise<string> {
  switch (type) {
    case "PDF":
    case "DOCX":
    case "IMAGE": {
      if (!opts.buffer) throw new Error(`${type} requires a file`);

      // Preferred path: LlamaParse (tables -> Markdown, OCR for images).
      if (isDocParseEnabled()) {
        try {
          const md = await parseDocumentToMarkdown(
            opts.buffer,
            opts.filename ?? DEFAULT_FILENAME[type],
          );
          if (md.trim()) return md;
        } catch (error) {
          // Never fail ingestion because the parser hiccuped — fall back below.
          console.error("[RAG docparse fallback]", error);
        }
      }

      // Local fallback (text-only; tables get flattened, images unsupported).
      if (type === "PDF") {
        const pdf = await getDocumentProxy(new Uint8Array(opts.buffer));
        const { text } = await extractText(pdf, { mergePages: true });
        return text;
      }
      if (type === "DOCX") {
        const { value } = await mammoth.extractRawText({ buffer: opts.buffer });
        return value;
      }
      throw new Error(
        "Image parsing requires LLAMA_CLOUD_API_KEY — OCR is not available locally.",
      );
    }
    case "URL": {
      if (!opts.url) throw new Error("URL is required");
      const res = await fetch(opts.url, { headers: { "User-Agent": "WhatsCRM-KB/1.0" } });
      if (!res.ok) throw new Error(`Could not fetch URL (${res.status})`);
      const html = await res.text();
      const $ = cheerio.load(html);
      $("script, style, nav, footer, noscript").remove();
      return $("body").text();
    }
    case "TEXT":
    case "TXT":
    default:
      return opts.text ?? opts.buffer?.toString("utf-8") ?? "";
  }
}

// ─── Chunking ────────────────────────────────────────────────────────────────

function isTableLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && t.endsWith("|") && t.length > 1;
}

/**
 * Break text into "atoms" that must never be split: whole Markdown tables stay
 * intact, and prose is broken into sentences. This is what makes chunking
 * table-aware — a table is kept as one unit so its rows/headers stay together.
 */
function toAtoms(clean: string): { text: string; table: boolean }[] {
  const lines = clean.split("\n");
  const atoms: { text: string; table: boolean }[] = [];
  let prose: string[] = [];

  const flushProse = () => {
    const para = prose.join("\n").trim();
    prose = [];
    if (!para) return;
    for (const sentence of para.split(/(?<=[.!?])\s+|\n{2,}/)) {
      const s = sentence.trim();
      if (s) atoms.push({ text: s, table: false });
    }
  };

  for (let i = 0; i < lines.length; ) {
    if (isTableLine(lines[i])) {
      flushProse();
      const rows: string[] = [];
      while (i < lines.length && isTableLine(lines[i])) rows.push(lines[i].trim()), i++;
      atoms.push({ text: rows.join("\n"), table: true });
    } else {
      prose.push(lines[i]);
      i++;
    }
  }
  flushProse();
  return atoms;
}

/**
 * Split text into overlapping chunks. Prose breaks on sentence/paragraph
 * boundaries; Markdown tables are kept whole (a table larger than chunkSize
 * becomes its own chunk) so tabular data survives retrieval intact.
 */
export function chunkText(raw: string, chunkSize = 1000, overlap = 150): string[] {
  const clean = raw.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];

  const atoms = toAtoms(clean);
  const chunks: string[] = [];
  let current = "";

  for (const atom of atoms) {
    // Keep an oversized table as its own chunk rather than splitting it.
    if (atom.table && atom.text.length > chunkSize) {
      if (current.trim()) chunks.push(current.trim());
      current = "";
      chunks.push(atom.text.trim());
      continue;
    }

    // Prose longer than a chunk on its own has no sentence boundary to break on — extracted
    // PDFs without terminators, CJK text, bullet lists and log dumps all produce one. Left
    // whole it became a single chunk of the entire document, which the embedding API rejects
    // outright ("Input text exceeds the model's maximum of 8194 tokens"), failing the whole
    // upload. Hard-split it on length, keeping the same overlap prose chunks get.
    if (!atom.table && atom.text.length > chunkSize) {
      if (current.trim()) chunks.push(current.trim());
      current = "";
      const step = Math.max(1, chunkSize - overlap);
      for (let i = 0; i < atom.text.length; i += step) {
        const piece = atom.text.slice(i, i + chunkSize).trim();
        if (piece) chunks.push(piece);
      }
      continue;
    }

    const sep = current ? (atom.table || current.endsWith("|") ? "\n\n" : " ") : "";
    if (current && (current.length + sep.length + atom.text.length) > chunkSize) {
      chunks.push(current.trim());
      const tail = current.slice(Math.max(0, current.length - overlap));
      current = tail + (atom.table ? "\n\n" : " ") + atom.text;
    } else {
      current += sep + atom.text;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// ─── Ingestion ───────────────────────────────────────────────────────────────

export interface IngestResult {
  chunkCount: number;
  vectorIds: string[];
}

/**
 * Extract → chunk → embed → upsert to Qdrant. Every point is tagged with
 * tenantId + docId so it can be filtered on search and removed on delete.
 * Returns the point IDs and chunk count to persist on the KnowledgeDoc row.
 */
export async function ingestDocument(params: {
  tenantId: string;
  /**
   * Owning business. Written into every point's payload so retrieval can filter on it — a tenant
   * may run several businesses and their knowledge bases are not shared.
   *
   * Optional only for backward compatibility with points written before business scoping existed;
   * every caller in the application supplies it.
   */
  businessId?: string;
  docId: string;
  type: DocType;
  buffer?: Buffer;
  url?: string;
  text?: string;
  filename?: string;
}): Promise<IngestResult> {
  const { tenantId, businessId, docId, type, buffer, url, text, filename } = params;

  const extracted = await extractDocumentText(type, { buffer, url, text, filename });
  const chunks = chunkText(extracted);
  if (chunks.length === 0) return { chunkCount: 0, vectorIds: [] };

  await ensureCollection();

  const vectors = await embedPassages(chunks);
  const vectorIds = chunks.map(() => randomUUID());

  try {
    await qdrant().upsert(KB_COLLECTION, {
      wait: true,
      points: chunks.map((chunk, i) => ({
        id: vectorIds[i],
        vector: vectors[i],
        payload: { tenantId, ...(businessId && { businessId }), docId, chunkIndex: i, text: chunk },
      })),
    });
  } catch (error) {
    try {
      await deleteDocumentVectors(tenantId, businessId ?? "", docId);
    } catch {
      // Swallow cleanup errors so the original ingestion failure remains visible.
    }
    throw error;
  }

  return { chunkCount: chunks.length, vectorIds };
}

// ─── Retrieval ───────────────────────────────────────────────────────────────

/** Default breadth of a retrieval. Exported so the tuning UI can show the real value. */
export const RETRIEVAL_LIMIT = 6;

/**
 * Default cutoff. jina-embeddings-v3 cosine scores run low — relevant chunks land
 * around 0.35-0.55 — so 0.4 was dropping legitimately relevant context and 0.3
 * keeps recall higher. Exported for the same reason: a number this consequential
 * should be visible to whoever is wondering why a document went unused.
 */
export const RETRIEVAL_SCORE_THRESHOLD = 0.3;

/** One matching chunk, as the vector store returned it. */
export interface RetrievedChunk {
  docId: string;
  chunkIndex: number;
  score: number;
  text: string;
}

/** A document that contributed to an answer, with its best-matching score. */
export interface KnowledgeSource {
  docId: string;
  name: string;
  /** Highest chunk score from this document — how strongly it matched. */
  score: number;
  /** How many of the retrieved chunks came from it. */
  chunks: number;
}

export interface KnowledgeRetrieval {
  /** Joined text ready to pass as `knowledgeContext`, or undefined if nothing matched. */
  context?: string;
  /** The documents behind that text, best match first. Empty when nothing matched. */
  sources: KnowledgeSource[];
}

/**
 * Embed the query and return the matching chunks, unjoined.
 *
 * Split out of `retrieveContext` because two callers want different things from
 * the same search: an AI reply wants one blob of text to ground on, and the
 * knowledge-base tester wants the individual chunks with their scores so a human
 * can see what the AI would have been handed and why. Running the search twice
 * in two shapes is how those two answers drift apart.
 */
export async function searchKnowledge(
  tenantId: string,
  businessId: string,
  query: string,
  opts: { limit?: number; scoreThreshold?: number } = {},
): Promise<RetrievedChunk[]> {
  if (!query.trim() || !process.env.QDRANT_URL) return [];

  try {
    await ensureCollection();
    const vector = await embedQuery(query);
    const results = await qdrant().search(KB_COLLECTION, {
      vector,
      limit: opts.limit ?? RETRIEVAL_LIMIT,
      score_threshold: opts.scoreThreshold ?? RETRIEVAL_SCORE_THRESHOLD,
      // Both keys, always. The knowledge-base UI has been business-scoped for a while, but this
      // filter was still tenant-only — so a customer messaging business A could be answered from
      // business B's documents, which is the leak the UI scoping was meant to prevent. `must` is
      // an AND, and both keys carry a payload index (see ensureCollection).
      filter: {
        must: [
          { key: "tenantId", match: { value: tenantId } },
          { key: "businessId", match: { value: businessId } },
        ],
      },
      with_payload: true,
    });

    return results
      .map((r) => ({
        docId: String(r.payload?.docId ?? ""),
        chunkIndex: typeof r.payload?.chunkIndex === "number" ? r.payload.chunkIndex : 0,
        score: typeof r.score === "number" ? r.score : 0,
        text: String(r.payload?.text ?? ""),
      }))
      .filter((c) => c.text);
  } catch (error) {
    // RAG is an enhancement — never let a vector-store hiccup break the reply.
    console.error("[RAG searchKnowledge]", error);
    return [];
  }
}

/**
 * Collapse chunks onto the documents they came from, best match first.
 *
 * A document is scored by its BEST chunk rather than its average or its total.
 * Averaging punishes a long document for the passages that did not match — which
 * is most of them, by construction — and summing would rank a document that
 * matched weakly five times above one that answered the question outright.
 *
 * A chunk whose id is not in `names` drops out. That covers both a document
 * deleted since indexing and, more importantly, an id the caller did not
 * authorise: the lookup that builds this map is tenant-scoped, so filtering here
 * is what stops another workspace's filename reaching a citation.
 *
 * Pure, and exported, because this is the part with judgement in it.
 */
export function groupChunksByDoc(
  chunks: RetrievedChunk[],
  names: Map<string, string>,
): KnowledgeSource[] {
  const byDoc = new Map<string, KnowledgeSource>();

  for (const chunk of chunks) {
    const name = names.get(chunk.docId);
    if (!name) continue;

    const existing = byDoc.get(chunk.docId);
    if (existing) {
      existing.chunks += 1;
      existing.score = Math.max(existing.score, chunk.score);
    } else {
      byDoc.set(chunk.docId, { docId: chunk.docId, name, score: chunk.score, chunks: 1 });
    }
  }

  return [...byDoc.values()].sort((a, b) => b.score - a.score);
}

/**
 * Resolve retrieved chunks to the documents they came from.
 *
 * Scoped by tenantId, so a payload carrying a docId from elsewhere resolves to
 * nothing rather than leaking another workspace's filename into a citation.
 */
async function resolveSources(
  tenantId: string,
  chunks: RetrievedChunk[],
): Promise<KnowledgeSource[]> {
  const docIds = [...new Set(chunks.map((c) => c.docId).filter(Boolean))];
  if (docIds.length === 0) return [];

  try {
    const docs = await prisma.knowledgeDoc.findMany({
      where: { id: { in: docIds }, tenantId },
      select: { id: true, name: true },
    });
    return groupChunksByDoc(chunks, new Map(docs.map((d) => [d.id, d.name])));
  } catch (error) {
    // A citation is a nice-to-have layered on an answer that already works.
    console.error("[RAG resolveSources]", error);
    return [];
  }
}

/**
 * Search this tenant's vectors and return the joined text of the top matches —
 * ready to pass as `knowledgeContext` to generateReply() — alongside the
 * documents it came from.
 *
 * The sources are the point of the return shape. Joined into one string, the
 * document identity was thrown away, so a wrong AI answer could not be traced
 * back to the file that caused it. With several documents indexed, "the
 * knowledge base said so" is not something anyone can act on.
 */
export async function retrieveContext(
  tenantId: string,
  businessId: string,
  query: string,
  opts: { limit?: number; scoreThreshold?: number } = {},
): Promise<KnowledgeRetrieval> {
  const chunks = await searchKnowledge(tenantId, businessId, query, opts);
  if (chunks.length === 0) return { sources: [] };

  return {
    context: chunks.map((c) => c.text).join("\n\n---\n\n"),
    sources: await resolveSources(tenantId, chunks),
  };
}

/**
 * Reassemble a document's own text from the chunks stored against it.
 *
 * `KnowledgeDoc.content` only started being persisted when indexing moved to the queue — the
 * upload route needed the extracted text to survive the response. Documents ingested before that
 * have `content = null` even though they are fully indexed, and their text exists nowhere else but
 * the `text` payload on their vectors. Anything that wants to read a whole document (FAQ
 * generation, for one) has to be able to get it from there or those documents are permanently
 * opaque to it.
 *
 * Not a retrieval function: no query, no scoring, no threshold. It scrolls by filter, so it
 * returns every chunk, and sorts by the `chunkIndex` written at ingest so they come back in
 * document order rather than in whatever order the store hands them over.
 */
export async function fetchDocumentText(
  tenantId: string,
  docId: string,
  opts: { maxChars?: number } = {},
): Promise<string> {
  if (!process.env.QDRANT_URL) return "";

  const maxChars = opts.maxChars ?? 60_000;
  const chunks: { index: number; text: string }[] = [];
  let offset: string | number | null = null;

  try {
    await ensureCollection();

    // Paged, because a long PDF runs to hundreds of chunks and Qdrant caps a single page.
    // Bounded by maxChars as well as by the cursor: reading a 500-page document into memory to
    // then truncate it would be work done only to throw away.
    do {
      const page = await qdrant().scroll(KB_COLLECTION, {
        // tenantId + docId, deliberately without businessId. Unlike `retrieveContext` — which
        // searches across a whole knowledge base and therefore must be pinned to one business —
        // this asks for one already-identified document, and the caller has already proved it
        // owns that row by loading it under `where: { id, tenantId, businessId }`. Adding the
        // key here would buy no isolation and would exclude the documents that need this most:
        // points written before business scoping existed carry no businessId at all, so a `must`
        // on it matches none of them.
        filter: {
          must: [
            { key: "tenantId", match: { value: tenantId } },
            { key: "docId", match: { value: docId } },
          ],
        },
        limit: 128,
        with_payload: true,
        with_vector: false,
        ...(offset != null && { offset }),
      });

      for (const point of page.points) {
        const text = point.payload?.text;
        const index = point.payload?.chunkIndex;
        if (typeof text === "string" && text) {
          chunks.push({ index: typeof index === "number" ? index : chunks.length, text });
        }
      }

      offset = page.nextOffset;
    } while (offset != null && chunks.reduce((n, c) => n + c.text.length, 0) < maxChars);
  } catch (error) {
    // The caller decides what an empty result means; a vector-store hiccup is not its problem.
    console.error("[RAG fetchDocumentText]", error);
    return "";
  }

  chunks.sort((a, b) => a.index - b.index);

  // Chunks overlap by design (see chunkText), so consecutive ones repeat up to `overlap`
  // characters. Joined raw, every boundary would duplicate a sentence — harmless for retrieval,
  // but it reads as stuttering text to anything summarising the whole document. The repeated
  // head is detected and dropped instead.
  let out = "";
  for (const chunk of chunks) {
    if (!out) {
      out = chunk.text;
      continue;
    }
    let overlap = 0;
    const max = Math.min(300, out.length, chunk.text.length);
    for (let n = max; n > 20; n--) {
      if (out.endsWith(chunk.text.slice(0, n))) {
        overlap = n;
        break;
      }
    }
    out += (overlap ? "" : "\n") + chunk.text.slice(overlap);
  }

  return out.slice(0, maxChars);
}

// ─── Deletion ────────────────────────────────────────────────────────────────

/** Remove all of a document's vectors (call when a KnowledgeDoc is deleted). */
export async function deleteDocumentVectors(tenantId: string, businessId: string, docId: string): Promise<void> {
  if (!process.env.QDRANT_URL) return;
  try {
    await qdrant().delete(KB_COLLECTION, {
      wait: true,
      filter: {
        must: [
          { key: "tenantId", match: { value: tenantId } },
          ...(businessId ? [{ key: "businessId", match: { value: businessId } }] : []),
          { key: "docId", match: { value: docId } },
        ],
      },
    });
  } catch (error) {
    console.error("[RAG deleteDocumentVectors]", error);
  }
}
