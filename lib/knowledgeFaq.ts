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
import { INTENT_POINTS, readIntent, type IntentWeight } from "@/lib/intent";

export interface DocFaq {
  question: string;
  answer: string;
  /**
   * Which document the answer came from. Only set on multi-document sets, where
   * "the document" is ambiguous and knowing which of three PDFs a claim came out
   * of is the difference between a citation and a rumour.
   */
  source?: string;
  /**
   * A human rewrote this question. Kept so a bulk regenerate can leave edited
   * questions alone — the whole point of editing one is that the model's version
   * was wrong, and silently replacing it would undo the correction.
   */
  edited?: boolean;
  /**
   * What tapping this question says about the person who tapped it. Absent means
   * "none" — no signal, which is the right default for a question nobody has
   * classified rather than assuming every FAQ is commercial.
   */
  intent?: FaqIntent;
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
  /** How answers in this list are written. Always resolved, never undefined. */
  style: FaqStyle;
}

/** How many questions to ask for. Enough to be useful, few enough to scan on a card. */
export const FAQ_COUNT = 6;

/** Ceiling on a hand-edited list, so one workspace cannot store a thousand rows. */
export const FAQ_MAX = 30;

/**
 * Coerce stored JSON into a FAQ list.
 *
 * Shared by the metadata reader and the faq-set reader, which hold the same
 * array in two different columns. Answerless rows survive: a question waiting
 * for its answer is a real state now that generation runs one at a time, and
 * dropping it here would make half a generated list vanish on reload.
 */
export function readFaqList(raw: unknown): DocFaq[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isRecord)
    .map((f) => ({
      question: String(f.question ?? "").trim(),
      answer: String(f.answer ?? "").trim(),
      ...(typeof f.source === "string" && f.source ? { source: f.source } : {}),
      ...(f.edited === true ? { edited: true } : {}),
      ...(readFaqIntent(f.intent) === "none" ? {} : { intent: readFaqIntent(f.intent) }),
    }))
    .filter((f) => f.question)
    .slice(0, FAQ_MAX);
}

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
  if (!isRecord(metadata)) return { faqs: [], style: { ...DEFAULT_FAQ_STYLE } };

  const faqs = readFaqList(metadata.faqs);

  return {
    faqs,
    generatedAt: typeof metadata.faqsGeneratedAt === "string" ? metadata.faqsGeneratedAt : undefined,
    error: typeof metadata.faqsError === "string" ? metadata.faqsError : undefined,
    truncated: metadata.faqsTruncated === true,
    style: readFaqStyle(metadata.faqStyle),
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
  result: {
    faqs?: DocFaq[];
    error?: string;
    generatedAt?: string;
    truncated?: boolean;
    style?: FaqStyle;
  },
): Prisma.InputJsonValue {
  const base = isRecord(metadata) ? { ...metadata } : {};

  // Written whenever it is supplied, including on a save that changes nothing
  // else — the style is how the NEXT answer will be written, so it has to
  // persist before anything is generated with it.
  if (result.style) base.faqStyle = { ...result.style };

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

/**
 * Pull a list of question strings out of whatever the model returned.
 *
 * Separate from `parseFaqResponse` because the two calls are now different
 * shapes: proposing questions returns `["...", "..."]`, answering one returns an
 * object. Tolerant of a model that ignores the instruction and sends
 * `[{"question": "..."}]` anyway, which small models do often enough that
 * failing on it would mean a retry for nothing.
 */
export function parseQuestionsResponse(raw: string, limit = FAQ_COUNT): string[] {
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

  const seen = new Set<string>();
  const questions: string[] = [];
  for (const item of parsed) {
    const text = (typeof item === "string" ? item : isRecord(item) ? String(item.question ?? item.q ?? "") : "").trim();
    if (!text) continue;
    // Case-insensitively deduped. Asked for six questions about a short
    // document, a model will happily return the same one phrased two ways.
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    questions.push(text);
    if (questions.length >= limit) break;
  }
  return questions;
}

/**
 * Pull one answer out of whatever the model returned.
 *
 * Falls back to treating the whole response as the answer when it is not JSON:
 * a single-answer call is the one place where unparseable output is still
 * usable, because plain prose is exactly what was asked for.
 */
export function parseAnswerResponse(raw: string): { answer: string; source?: string } | null {
  if (!raw?.trim()) return null;

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
      if (isRecord(parsed)) {
        const answer = String(parsed.answer ?? parsed.a ?? "").trim();
        const source = String(parsed.source ?? "").trim();
        if (answer) return { answer, ...(source && { source }) };
      }
    } catch {
      // Fall through to the prose reading below.
    }
  }

  const prose = raw.trim();
  return prose ? { answer: prose } : null;
}

/**
 * Narrow a FAQ list to something Prisma will accept in a Json column.
 *
 * `DocFaq` has optional fields, and an object with `source: undefined` on it is
 * not a valid `InputJsonValue` — Prisma has no way to store "this key exists and
 * holds nothing". Absent keys are what it wants, so they are dropped rather than
 * passed through, which also keeps a cleared citation from being stored as a
 * null that later reads back as a source.
 */
export function toJsonFaqs(faqs: DocFaq[]): Prisma.InputJsonValue {
  return faqs.map((faq) => ({
    question: faq.question,
    answer: faq.answer,
    ...(faq.source ? { source: faq.source } : {}),
    ...(faq.edited ? { edited: true } : {}),
    ...(faq.intent && faq.intent !== "none" ? { intent: faq.intent } : {}),
  }));
}

// ─── Answer style ─────────────────────────────────────────────────────────────

/**
 * How the answers should be written.
 *
 * Stored per collection rather than passed per click, because the setting has to
 * survive: re-answering one question a month later has to produce something that
 * sits beside the other twenty, and a style that reset on every page load would
 * quietly give you a list written five different ways.
 *
 * `language` earns its place on a WhatsApp product sold in India — the source
 * document is often English while the customers being answered are not, and
 * translating twenty answers by hand afterwards is not a workflow.
 */
export interface FaqStyle {
  /** brief ≈ one sentence · standard ≈ two · detailed ≈ a short paragraph. */
  length: "brief" | "standard" | "detailed";
  tone: "plain" | "friendly" | "formal";
  /** Free text. Empty means no audience instruction is given at all. */
  audience: string;
  /** Language to answer in. Empty means "the language of the document". */
  language: string;
}

export const DEFAULT_FAQ_STYLE: FaqStyle = {
  length: "standard",
  tone: "plain",
  audience: "",
  language: "",
};

export const FAQ_LENGTHS: { value: FaqStyle["length"]; label: string; hint: string }[] = [
  { value: "brief", label: "Brief", hint: "One sentence. Best for a WhatsApp reply." },
  { value: "standard", label: "Standard", hint: "One or two sentences." },
  { value: "detailed", label: "Detailed", hint: "A short paragraph, with the caveats." },
];

export const FAQ_TONES: { value: FaqStyle["tone"]; label: string }[] = [
  { value: "plain", label: "Plain" },
  { value: "friendly", label: "Friendly" },
  { value: "formal", label: "Formal" },
];

/** Read a stored style, falling back field by field so a partial record still works. */
export function readFaqStyle(raw: unknown): FaqStyle {
  if (!isRecord(raw)) return { ...DEFAULT_FAQ_STYLE };

  const length = raw.length;
  const tone = raw.tone;
  return {
    length: length === "brief" || length === "detailed" || length === "standard"
      ? length
      : DEFAULT_FAQ_STYLE.length,
    tone: tone === "friendly" || tone === "formal" || tone === "plain" ? tone : DEFAULT_FAQ_STYLE.tone,
    audience: typeof raw.audience === "string" ? raw.audience.slice(0, 200) : "",
    language: typeof raw.language === "string" ? raw.language.slice(0, 60) : "",
  };
}

/** True when the style is the default — used to decide whether to badge the control. */
export function isDefaultFaqStyle(style: FaqStyle): boolean {
  return (
    style.length === DEFAULT_FAQ_STYLE.length &&
    style.tone === DEFAULT_FAQ_STYLE.tone &&
    !style.audience &&
    !style.language
  );
}

/**
 * The instruction lines a style adds to a prompt.
 *
 * Returns nothing for an unset field rather than a neutral sentence. "Use a plain
 * tone" spends tokens telling the model to do what it already does, and every
 * added instruction is one more thing competing with "answer only from the text".
 */
export function faqStyleInstructions(style: FaqStyle): string[] {
  const lines: string[] = [];

  if (style.length === "brief") lines.push("Answer in ONE short sentence.");
  else if (style.length === "detailed") {
    lines.push("Answer in three or four sentences, including any conditions or exceptions the text gives.");
  } else lines.push("Answer in one or two sentences.");

  if (style.tone === "friendly") lines.push("Write warmly and conversationally, as a helpful person would.");
  else if (style.tone === "formal") lines.push("Write formally and precisely, as published policy.");

  if (style.audience) lines.push(`Write for this audience: ${style.audience}.`);
  if (style.language) {
    lines.push(
      `Write the answer in ${style.language}, even when the source text is in another language. Do not translate names, prices or codes.`,
    );
  }

  return lines;
}

/**
 * Narrow a style to something Prisma will accept in a Json column.
 *
 * Same reason as `toJsonFaqs`: an interface with named fields is not an
 * `InputJsonObject` to TypeScript, which requires an index signature. Spelling
 * the object out satisfies that and drops anything not part of the shape.
 */
export function toJsonStyle(style: FaqStyle): Prisma.InputJsonValue {
  return {
    length: style.length,
    tone: style.tone,
    audience: style.audience,
    language: style.language,
  };
}

// ─── Buying intent ────────────────────────────────────────────────────────────

/**
 * What tapping this question says about the person who tapped it.
 *
 * Named rather than numeric because an admin choosing "+15" has to
 * reverse-engineer the scale to know what it means, whereas "Buying signal" says
 * it outright. The points behind the names stay here so the scale can be tuned
 * in one place without every stored FAQ carrying a stale number.
 */
export type FaqIntent = IntentWeight;

export const FAQ_INTENTS: { value: FaqIntent; label: string; hint: string }[] = [
  { value: "none", label: "No signal", hint: "Informational. Asking it says nothing about intent." },
  { value: "interest", label: "Interest", hint: "Researching — specs, coverage, how it works." },
  { value: "buying", label: "Buying signal", hint: "Pricing, ordering, availability, next steps." },
];

/**
 * Points added to a lead's score when the question is tapped.
 *
 * Aliased onto the shared scale rather than restated: an IVR menu option marked
 * "buying" and a FAQ question marked "buying" describe the same customer, and
 * two copies of these numbers would drift into two definitions of "warm".
 */
export const FAQ_INTENT_POINTS = INTENT_POINTS;

export const readFaqIntent = readIntent;
