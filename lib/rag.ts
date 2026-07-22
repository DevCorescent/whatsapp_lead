import { randomUUID } from "crypto";
import * as cheerio from "cheerio";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { embedPassages, embedQuery } from "@/lib/embeddings";
import { ensureCollection, KB_COLLECTION, qdrant } from "@/lib/qdrant";

export type DocType = "TEXT" | "URL" | "PDF" | "DOCX" | "TXT";

// ─── Text extraction ─────────────────────────────────────────────────────────

/** Pull plain text out of a raw uploaded file, by type. */
export async function extractDocumentText(
  type: DocType,
  opts: { buffer?: Buffer; url?: string; text?: string },
): Promise<string> {
  switch (type) {
    case "PDF": {
      if (!opts.buffer) throw new Error("PDF requires a file");
      const pdf = await getDocumentProxy(new Uint8Array(opts.buffer));
      const { text } = await extractText(pdf, { mergePages: true });
      return text;
    }
    case "DOCX": {
      if (!opts.buffer) throw new Error("DOCX requires a file");
      const { value } = await mammoth.extractRawText({ buffer: opts.buffer });
      return value;
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

/**
 * Split text into overlapping chunks on paragraph/sentence boundaries.
 * Overlap preserves context that would otherwise be cut mid-thought.
 */
export function chunkText(raw: string, chunkSize = 1000, overlap = 150): string[] {
  const clean = raw.replace(/\s+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
  if (!clean) return [];

  // Prefer to break on paragraph/sentence boundaries near the target size.
  const pieces = clean.split(/(?<=[.!?])\s+|\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  for (const piece of pieces) {
    if ((current + " " + piece).length > chunkSize && current) {
      chunks.push(current.trim());
      current = current.slice(Math.max(0, current.length - overlap)) + " " + piece;
    } else {
      current += (current ? " " : "") + piece;
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
  docId: string;
  type: DocType;
  buffer?: Buffer;
  url?: string;
  text?: string;
}): Promise<IngestResult> {
  const { tenantId, docId, type, buffer, url, text } = params;

  const extracted = await extractDocumentText(type, { buffer, url, text });
  const chunks = chunkText(extracted);
  if (chunks.length === 0) return { chunkCount: 0, vectorIds: [] };

  await ensureCollection();

  const vectors = await embedPassages(chunks);
  const vectorIds = chunks.map(() => randomUUID());

  await qdrant().upsert(KB_COLLECTION, {
    wait: true,
    points: chunks.map((chunk, i) => ({
      id: vectorIds[i],
      vector: vectors[i],
      payload: { tenantId, docId, chunkIndex: i, text: chunk },
    })),
  });

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
  query: string,
  opts: { limit?: number; scoreThreshold?: number } = {},
): Promise<string | undefined> {
  if (!query.trim() || !process.env.QDRANT_URL) return undefined;

  try {
    const vector = await embedQuery(query);
    const results = await qdrant().search(KB_COLLECTION, {
      vector,
      limit: opts.limit ?? 6,
      // jina-embeddings-v3 cosine scores run low; relevant chunks land ~0.35-0.55,
      // so 0.4 was dropping legitimately relevant context. 0.3 keeps recall higher.
      score_threshold: opts.scoreThreshold ?? 0.3,
      filter: { must: [{ key: "tenantId", match: { value: tenantId } }] },
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

// ─── Deletion ────────────────────────────────────────────────────────────────

/** Remove all of a document's vectors (call when a KnowledgeDoc is deleted). */
export async function deleteDocumentVectors(tenantId: string, docId: string): Promise<void> {
  if (!process.env.QDRANT_URL) return;
  try {
    await qdrant().delete(KB_COLLECTION, {
      wait: true,
      filter: {
        must: [
          { key: "tenantId", match: { value: tenantId } },
          { key: "docId", match: { value: docId } },
        ],
      },
    });
  } catch (error) {
    console.error("[RAG deleteDocumentVectors]", error);
  }
}
