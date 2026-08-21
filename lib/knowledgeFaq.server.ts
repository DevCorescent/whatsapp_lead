// ============================================================================
// MODULE : Per-document FAQ generation (server only)
// ============================================================================
//
// Split from `knowledgeFaq.ts` because this half calls the model: the shared
// module is imported by the knowledge-base page to read cached FAQs off a row,
// and pulling the OpenAI client into that bundle for a function the browser can
// never call is the kind of import that quietly doubles a page's JavaScript.
//
// FAQs are generated from the document's own extracted text (KnowledgeDoc.content)
// rather than from a vector search, so one document's questions can never be
// contaminated by another's — which is the whole point of showing them per
// document. The result is cached on `metadata`; a file does not change after
// upload, so regenerating on every page load would be paying twice for the same
// answer.

import {
  answerFaqQuestionCompletion,
  generateFaqCompletion,
  generateFaqQuestionsCompletion,
} from "@/lib/ai";
import { fetchDocumentText } from "@/lib/rag";
import {
  DEFAULT_FAQ_STYLE,
  FAQ_COUNT,
  faqStyleInstructions,
  parseAnswerResponse,
  parseFaqResponse,
  parseQuestionsResponse,
  type DocFaq,
  type FaqStyle,
} from "@/lib/knowledgeFaq";

/**
 * Cap on how much of the document is sent to the model.
 *
 * A 200-page PDF does not fit in a context window and does not need to: the
 * questions a document can answer are overwhelmingly set by its opening
 * sections, and the alternative — map-reduce over every chunk — costs many
 * completions for what is a card decoration. Truncation is reported back so the
 * caller can say the FAQs cover the first part of a long document.
 */
export const MAX_CHARS = 24_000;

/** Below this there is nothing to ask about, and a model call would be wasted. */
const MIN_CHARS = 200;

/**
 * Generate the FAQs a single document can answer.
 *
 * Throws rather than returning an empty list: "no questions" and "the call
 * failed" need different treatment on the card, and the caller records the
 * message so the document can explain itself.
 */
export async function generateDocFaqs(params: {
  name: string;
  content: string;
  model?: string | null;
}): Promise<{ faqs: DocFaq[]; truncated: boolean }> {
  const text = (params.content ?? "").trim();
  if (text.length < MIN_CHARS) {
    throw new Error("Not enough text in this document to generate FAQs.");
  }

  const truncated = text.length > MAX_CHARS;
  const excerpt = truncated ? text.slice(0, MAX_CHARS) : text;

  const raw = await generateFaqCompletion({
    name: params.name,
    excerpt,
    count: FAQ_COUNT,
    model: params.model,
  });

  const faqs = parseFaqResponse(raw);
  if (faqs.length === 0) {
    throw new Error("The model did not return any usable questions for this document.");
  }

  return { faqs, truncated };
}

// ─── Corpus assembly ──────────────────────────────────────────────────────────

export interface CorpusDoc {
  id: string;
  name: string;
  /** Extracted text. Empty is tolerated — an empty document is simply skipped. */
  content: string;
}

export interface Corpus {
  /** The text to send, with each document labelled. */
  text: string;
  /** Names of the documents that actually contributed text, in order. */
  sources: string[];
  truncated: boolean;
}

/**
 * Join several documents into one prompt-sized corpus.
 *
 * The budget is split per document rather than filled first-come. Concatenated
 * and cut at 24k, a 200-page manual would consume the whole allowance and the
 * two-page price list beside it would contribute nothing — the set would claim
 * to cover three documents and answer from one. An equal share each is not
 * perfect either, but it is the version whose failure is visible: every document
 * is represented, and `truncated` says the long ones were cut.
 *
 * Each section is labelled with its filename so the model can attribute an
 * answer, which is the only reason a multi-document answer can carry a source.
 */
export function buildCorpus(docs: CorpusDoc[], maxChars = MAX_CHARS): Corpus {
  const usable = docs.filter((d) => (d.content ?? "").trim().length > 0);
  if (usable.length === 0) return { text: "", sources: [], truncated: false };

  // Headers cost characters too; leave room so the budget is not overshot by the
  // labels that make attribution possible.
  const overhead = usable.reduce((n, d) => n + d.name.length + 24, 0);
  const share = Math.max(500, Math.floor((maxChars - overhead) / usable.length));

  let truncated = false;
  const sections = usable.map((doc) => {
    const text = doc.content.trim();
    const cut = text.length > share;
    if (cut) truncated = true;
    return `### ${doc.name}\n${cut ? text.slice(0, share) : text}`;
  });

  return {
    text: sections.join("\n\n"),
    sources: usable.map((d) => d.name),
    truncated,
  };
}

// ─── One question at a time ───────────────────────────────────────────────────

/**
 * Propose questions without answering them.
 *
 * Throws on an empty corpus for the same reason `generateDocFaqs` does: "these
 * documents have no questions" and "there was no text to read" look identical on
 * a card and need different fixes.
 */
export async function proposeFaqQuestions(params: {
  label: string;
  corpus: Corpus;
  count?: number;
  existing?: string[];
  style?: FaqStyle;
  model?: string | null;
}): Promise<{ questions: string[]; truncated: boolean }> {
  const { label, corpus, count = FAQ_COUNT, existing = [], model } = params;
  const style = params.style ?? DEFAULT_FAQ_STYLE;

  if (corpus.text.trim().length < MIN_CHARS) {
    throw new Error("Not enough text in these documents to suggest questions.");
  }

  const raw = await generateFaqQuestionsCompletion({
    label,
    excerpt: corpus.text,
    count,
    existing,
    // Only the instructions that change what a QUESTION looks like. Length and
    // tone describe an answer, and feeding them here would have the model
    // writing questions "in one short sentence" for no reason.
    styleLines: [
      ...(style.language ? [`Write the questions in ${style.language}.`] : []),
      ...(style.audience ? [`These questions are asked by: ${style.audience}.`] : []),
    ],
    model,
  });

  const questions = parseQuestionsResponse(raw, count);
  if (questions.length === 0) {
    throw new Error("The model did not return any usable questions.");
  }

  return { questions, truncated: corpus.truncated };
}

/**
 * Answer one question from the corpus.
 *
 * The question is whatever the caller passes — the model's own suggestion, or
 * the version a human rewrote. That is the point of splitting the call: an
 * edited question gets a fresh answer against the same documents, rather than
 * the whole list being regenerated around it.
 */
export async function answerFaqQuestion(params: {
  question: string;
  corpus: Corpus;
  style?: FaqStyle;
  model?: string | null;
}): Promise<{ answer: string; source?: string }> {
  const question = params.question.trim();
  if (!question) throw new Error("Write the question first.");

  const style = params.style ?? DEFAULT_FAQ_STYLE;

  if (params.corpus.text.trim().length < MIN_CHARS) {
    throw new Error("Not enough text in these documents to answer from.");
  }

  const raw = await answerFaqQuestionCompletion({
    question,
    excerpt: params.corpus.text,
    sources: params.corpus.sources,
    styleLines: faqStyleInstructions(style),
    // A detailed answer does not fit the default budget, and a truncated
    // paragraph is worse than a short one that finished its sentence.
    maxTokens: style.length === "detailed" ? 600 : 300,
    model: params.model,
  });

  const parsed = parseAnswerResponse(raw);
  if (!parsed) throw new Error("The model did not return an answer for this question.");

  // Only keep a source the model was actually offered. Left unchecked it
  // invents plausible filenames, and a citation pointing at a document that does
  // not exist is worse than no citation at all.
  const source =
    parsed.source && params.corpus.sources.includes(parsed.source) ? parsed.source : undefined;

  return { answer: parsed.answer, ...(source && { source }) };
}

/**
 * Build a corpus from document rows, reading each one's text from wherever it
 * survives.
 *
 * `content` is null on anything indexed before the upload route started
 * persisting extracted text; for those the text exists only as the payload on
 * their vectors, and `fetchDocumentText` reads it back. Without that fallback
 * every older PDF would report itself as empty — which is exactly the state the
 * knowledge base is in today for documents uploaded a while ago.
 */
export async function resolveCorpus(
  tenantId: string,
  docs: { id: string; name: string; content: string | null }[],
  maxChars = MAX_CHARS,
): Promise<Corpus> {
  const filled = await Promise.all(
    docs.map(async (doc) => ({
      id: doc.id,
      name: doc.name,
      content: doc.content?.trim() || (await fetchDocumentText(tenantId, doc.id, { maxChars })),
    })),
  );
  return buildCorpus(filled, maxChars);
}
