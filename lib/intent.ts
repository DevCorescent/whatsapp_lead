// ============================================================================
// MODULE : Buying-intent vocabulary (shared server ⇄ client)
// ============================================================================
//
// The scale itself, with no dependencies at all — so the builder's inspector and
// the FAQ editor can import it without dragging Prisma into the browser bundle.
// `lib/leadSignal.ts` holds the half that touches the database.
//
// One scale, used by both FAQ questions and IVR menu options, because they are
// the same event to a sales team: the customer picked a commercial question off
// a list. Two scales would become two definitions of "warm".

export type IntentWeight = "none" | "interest" | "buying";

/**
 * Points added to a lead's score.
 *
 * Deliberately small against the 0-100 scale. One tap is evidence, not a
 * verdict, and a weight big enough to move a lead two bands on its own would
 * make the score say more than the customer did.
 */
export const INTENT_POINTS: Record<IntentWeight, number> = {
  none: 0,
  interest: 5,
  buying: 15,
};

/** Labels for the pickers, so the FAQ editor and the flow builder read alike. */
export const INTENT_CHOICES: { value: IntentWeight; label: string; hint: string }[] = [
  { value: "none", label: "Nothing", hint: "Informational. Picking it says nothing about intent." },
  { value: "interest", label: "Interest", hint: "Researching — how it works, what is covered." },
  { value: "buying", label: "Buying", hint: "Pricing, ordering, availability, next steps." },
];

export function readIntent(raw: unknown): IntentWeight {
  return raw === "interest" || raw === "buying" ? raw : "none";
}
