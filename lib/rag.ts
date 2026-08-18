import { randomUUID } from "crypto";
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

/**
 * Embed the query, search this tenant's vectors, and return the joined text of
 * the top matches — ready to pass as `knowledgeContext` to generateReply().
 * Returns undefined when nothing relevant is found.
 */
export async function retrieveContext(
  tenantId: string,
  businessId: string,
  query: string,
  opts: { limit?: number; scoreThreshold?: number } = {},
): Promise<string | undefined> {
  if (!query.trim() || !process.env.QDRANT_URL) return undefined;

  try {
    await ensureCollection();
    const vector = await embedQuery(query);
    const results = await qdrant().search(KB_COLLECTION, {
      vector,
      limit: opts.limit ?? 6,
      // jina-embeddings-v3 cosine scores run low; relevant chunks land ~0.35-0.55,
      // so 0.4 was dropping legitimately relevant context. 0.3 keeps recall higher.
      score_threshold: opts.scoreThreshold ?? 0.3,
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

    const context = results
      .map((r) => (r.payload?.text as string | undefined))
      .filter(Boolean)
      .join("\n\n---\n\n");

    return context || undefined;
  } catch (error) {
    // RAG is an enhancement — never let a vector-store hiccup break the reply.
    console.error("[RAG retrieveContext]", error);
    return undefined;
  }
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
