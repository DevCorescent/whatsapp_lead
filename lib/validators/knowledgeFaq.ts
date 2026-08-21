import { z } from "zod";
import { FAQ_COUNT, FAQ_MAX } from "@/lib/knowledgeFaq";

/**
 * How answers should be written. Sent with every generate and every save, so the
 * setting is stored before anything is written with it.
 */
export const faqStyleSchema = z.object({
  length: z.enum(["brief", "standard", "detailed"]).default("standard"),
  tone: z.enum(["plain", "friendly", "formal"]).default("plain"),
  audience: z.string().trim().max(200).default(""),
  language: z.string().trim().max(60).default(""),
});

// ============================================================================
// MODULE : FAQ editing payloads
// ============================================================================
//
// The editor sends its WHOLE list on every mutation, and the server stores it
// whole. That is deliberate: a per-index write would read the stored array,
// change one slot and write it back, so an unsaved rewrite of question 2 would
// be silently reverted the moment question 3 was answered. Sending the list the
// user is actually looking at makes the request self-describing and the write
// a single overwrite with nothing to merge.

/** One editable row. `answer` may be empty — a question awaiting its answer. */
export const faqItemSchema = z.object({
  question: z.string().trim().min(1, "A question cannot be empty").max(500),
  answer: z.string().trim().max(4000).default(""),
  source: z.string().trim().max(300).optional(),
  edited: z.boolean().optional(),
  intent: z.enum(["none", "interest", "buying"]).optional(),
});

export const faqListSchema = z
  .array(faqItemSchema)
  .max(FAQ_MAX, `A list can hold at most ${FAQ_MAX} questions`);

/** Save the list as it stands. No model call, so no billing gate. */
export const saveFaqsSchema = z.object({
  faqs: faqListSchema,
  style: faqStyleSchema.optional(),
});

/**
 * Answer one row. The index is validated against the list in the same body
 * rather than against the stored one — they can differ, and the list in the
 * body is the one the user is looking at.
 */
export const answerFaqSchema = z
  .object({
    index: z.number().int().nonnegative(),
    faqs: faqListSchema,
    style: faqStyleSchema.optional(),
  })
  .refine((d) => d.index < d.faqs.length, {
    message: "That question is no longer in the list",
    path: ["index"],
  });

export const proposeQuestionsSchema = z.object({
  /** Ask for more on top of what is already there, instead of starting over. */
  existing: z.array(z.string().trim().min(1)).max(FAQ_MAX).default([]),
  /**
   * How many to propose. 1 is the "add one more" button, and the upper bound is
   * what one completion can write well — asking for twenty produces filler.
   */
  count: z.number().int().min(1).max(12).default(FAQ_COUNT),
  style: faqStyleSchema.optional(),
});

export const createFaqSetSchema = z.object({
  name: z.string().trim().min(1, "Name the set").max(120),
  // Two is the point of the feature — a one-document set is the per-document
  // FAQ list that already exists on the card.
  docIds: z.array(z.string().min(1)).min(2, "Pick at least two documents").max(10),
});

export const updateFaqSetSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  docIds: z.array(z.string().min(1)).min(2).max(10).optional(),
  faqs: faqListSchema.optional(),
  style: faqStyleSchema.optional(),
});
