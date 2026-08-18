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

import { generateFaqCompletion } from "@/lib/ai";
import { FAQ_COUNT, parseFaqResponse, type DocFaq } from "@/lib/knowledgeFaq";

/**
 * Cap on how much of the document is sent to the model.
 *
 * A 200-page PDF does not fit in a context window and does not need to: the
 * questions a document can answer are overwhelmingly set by its opening
 * sections, and the alternative — map-reduce over every chunk — costs many
 * completions for what is a card decoration. Truncation is reported back so the
 * caller can say the FAQs cover the first part of a long document.
 */
const MAX_CHARS = 24_000;

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
