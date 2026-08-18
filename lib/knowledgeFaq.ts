// ============================================================================
// MODULE : Per-document FAQs — shared shape, parsing and metadata helpers
// ============================================================================
//
// A knowledge document tells you nothing about itself once it is uploaded — the
// card shows a name, a chunk count and a green tick, and whether the AI can
// actually answer anything useful from it only becomes visible when a customer
// asks. These FAQs are that missing feedback: the questions this specific
// document can answer, with the answer the document itself gives, generated per
// document and listed underneath it.
//
// Everything here is pure, because the knowledge-base page (a client component)
// reads the cached FAQs straight off the row it already has. The generation half
// lives in `knowledgeFaq.server.ts` — it calls the model, so importing it from
// the browser bundle would drag the OpenAI client along with it.

import type { Prisma } from "@prisma/client";

export interface DocFaq {
  question: string;
  answer: string;
}

export interface FaqState {
  faqs: DocFaq[];
  /** ISO timestamp of the last successful generation, when there is one. */
  generatedAt?: string;
  /** Why the last attempt produced nothing — surfaced on the card. */
  error?: string;
  /**
   * The document was longer than the generator's input cap, so these questions come from its
   * opening sections only. Recorded because a partial answer that looks complete is the more
   * expensive mistake: someone reads six FAQs off a 200-page manual and concludes the AI has
   * nothing to say about chapter nine.
   */
  truncated?: boolean;
}

/** How many questions to ask for. Enough to be useful, few enough to scan on a card. */
export const FAQ_COUNT = 6;

// ─── Metadata helpers ────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Read the cached FAQ state off a document's metadata column.
 *
 * `metadata` is free-form JSON written by three different paths, so every field
 * is checked rather than trusted — a half-written entry renders as "no FAQs yet"
 * instead of crashing the whole list.
 */
export function readFaqState(metadata: unknown): FaqState {
  if (!isRecord(metadata)) return { faqs: [] };

  const raw = metadata.faqs;
  const faqs: DocFaq[] = Array.isArray(raw)
    ? raw
        .filter(isRecord)
        .map((f) => ({ question: String(f.question ?? ""), answer: String(f.answer ?? "") }))
        .filter((f) => f.question && f.answer)
    : [];

  return {
    faqs,
    generatedAt: typeof metadata.faqsGeneratedAt === "string" ? metadata.faqsGeneratedAt : undefined,
    error: typeof metadata.faqsError === "string" ? metadata.faqsError : undefined,
    truncated: metadata.faqsTruncated === true,
  };
}

/**
 * Merge a FAQ result into existing metadata.
 *
 * A merge rather than a replace because `metadata` also carries the indexing
 * status, the content hash and the file size — the fields the list and the
 * duplicate check read. Overwriting the column with only the FAQs would take
 * those with it and leave the document showing a spinner that never stops.
 */
export function mergeFaqMetadata(
  metadata: unknown,
  result: { faqs?: DocFaq[]; error?: string; generatedAt?: string; truncated?: boolean },
): Prisma.InputJsonValue {
  const base = isRecord(metadata) ? { ...metadata } : {};

  if (result.faqs) {
    base.faqs = result.faqs;
    base.faqsGeneratedAt = result.generatedAt ?? new Date().toISOString();
    delete base.faqsError;
    // Always rewritten, never merely set: a regeneration after the cap was raised — or against a
    // shorter replacement document — has to be able to clear the warning it once earned.
    if (result.truncated) base.faqsTruncated = true;
    else delete base.faqsTruncated;
  }
  if (result.error) {
    base.faqsError = result.error;
  }

  return base as Prisma.InputJsonValue;
}

/**
 * Pull a FAQ array out of whatever the model returned.
 *
 * Small models wrap JSON in prose or a ```json fence often enough that a bare
 * JSON.parse fails on perfectly good output, so the first array in the response
 * is located before parsing. A malformed response yields an empty list, which
 * the caller records as a failure rather than as "this document has no
 * questions".
 */
export function parseFaqResponse(raw: string): DocFaq[] {
  if (!raw?.trim()) return [];

  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end <= start) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter(isRecord)
    .map((item) => ({
      question: String(item.question ?? item.q ?? "").trim(),
      answer: String(item.answer ?? item.a ?? "").trim(),
    }))
    .filter((f) => f.question && f.answer)
    .slice(0, FAQ_COUNT);
}
