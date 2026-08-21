// ============================================================================
// MODULE : FAQ menus in WhatsApp
// ============================================================================
//
// Sends a curated FAQ list as a WhatsApp interactive list, and reads the tap
// back when it arrives on the webhook.
//
// The round trip is what makes FAQs worth curating. A customer picks a question
// from a menu, the answer you wrote comes back instantly — no model call, no AI
// credit, no chance of a hallucinated price — and you learn that this specific
// person asked this specific commercial question.
//
// Identity travels in the row id, never in the title. Meta truncates a row title
// to 24 characters, so "How do I pay for my order?" and "How do I pay the
// balance?" arrive back indistinguishable; the id is ours and comes back
// verbatim.

import type { DocFaq } from "@/lib/knowledgeFaq";

/** Meta's hard caps on an interactive list. Exceeding any of them is a 400. */
export const WA_LIST_MAX_ROWS = 10;
const WA_ROW_TITLE_MAX = 24;
const WA_ROW_DESCRIPTION_MAX = 72;
const WA_BODY_MAX = 1024;
const WA_BUTTON_MAX = 20;

export type FaqSourceKind = "document" | "set";

export interface FaqReplyRef {
  kind: FaqSourceKind;
  sourceId: string;
  index: number;
}

const PREFIX = "faq";

/** Encode which question this row is, for the reply to carry back. */
export function encodeFaqRowId(kind: FaqSourceKind, sourceId: string, index: number): string {
  return `${PREFIX}:${kind}:${sourceId}:${index}`;
}

/**
 * Read a row id back, or null when the reply is not one of ours.
 *
 * Deliberately strict. Every inbound interactive reply passes through this —
 * chatbot flow buttons, quick replies, anything a tenant builds later — and a
 * loose parse would file unrelated taps as FAQ interest.
 */
export function parseFaqRowId(rowId: string | null | undefined): FaqReplyRef | null {
  if (!rowId) return null;
  const parts = rowId.split(":");
  if (parts.length !== 4) return null;
  const [prefix, kind, sourceId, rawIndex] = parts;
  if (prefix !== PREFIX) return null;
  if (kind !== "document" && kind !== "set") return null;
  if (!sourceId) return null;

  const index = Number(rawIndex);
  if (!Number.isInteger(index) || index < 0) return null;

  return { kind, sourceId, index };
}

/** Cut to `max` characters, using an ellipsis so the truncation is visible. */
function clamp(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

export interface FaqListPayload {
  interactive: Record<string, unknown>;
  /** The questions actually included, in row order — what the ids point at. */
  sent: DocFaq[];
  /** How many were left off because Meta caps a list at ten rows. */
  dropped: number;
}

/**
 * Build the interactive-list payload for a FAQ collection.
 *
 * Answerless questions are excluded rather than sent: a menu row that leads to
 * nothing is worse than a shorter menu, and half-generated lists are a normal
 * state now that answers arrive one at a time.
 */
export function buildFaqListPayload(params: {
  kind: FaqSourceKind;
  sourceId: string;
  title: string;
  faqs: DocFaq[];
  bodyText?: string;
}): FaqListPayload {
  const answered = params.faqs.filter((f) => f.question.trim() && f.answer.trim());
  const sent = answered.slice(0, WA_LIST_MAX_ROWS);

  const rows = sent.map((faq, i) => ({
    // The index is into `sent`, not into the original list, so a dropped or
    // answerless question cannot shift what a row id points at.
    id: encodeFaqRowId(params.kind, params.sourceId, i),
    title: clamp(faq.question, WA_ROW_TITLE_MAX),
    description: clamp(faq.answer, WA_ROW_DESCRIPTION_MAX),
  }));

  return {
    interactive: {
      type: "list",
      body: {
        text: clamp(
          params.bodyText || "Here are the questions we get asked most. Tap one to see the answer.",
          WA_BODY_MAX,
        ),
      },
      action: {
        button: clamp("Questions", WA_BUTTON_MAX),
        sections: [{ title: clamp(params.title, WA_ROW_TITLE_MAX), rows }],
      },
    },
    sent,
    dropped: answered.length - sent.length,
  };
}

// ─── Reading a tap back ──────────────────────────────────────────────────────

/**
 * Look up the question and answer a tapped row points at.
 *
 * Reads the CURRENT collection, then falls back to the questions recorded on the
 * outbound menu message. A list sent last week may have been re-ordered or
 * re-answered since, and answering the wrong question is worse than not
 * answering at all — but the record of what was asked must survive either way.
 */
export interface ResolvedFaqTap {
  question: string;
  answer: string | null;
}
