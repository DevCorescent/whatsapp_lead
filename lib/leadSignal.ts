// ============================================================================
// MODULE : Nudging a lead's score from something the customer did
// ============================================================================
//
// Extracted so a FAQ tap and an IVR menu choice score identically. They are the
// same event as far as a sales team is concerned — the customer chose a
// commercial question off a list — and two copies of this logic would drift into
// two different definitions of "warm".

import { prisma } from "@/lib/prisma";
import { scoreLabelFor } from "@/lib/utils";

// The scale lives in lib/intent.ts, which imports nothing — this module pulls in
// Prisma, and a client component that only needs the point values must not have
// to take the database driver with it. Re-exported so server callers still get
// everything from one import.
export { INTENT_CHOICES, INTENT_POINTS, readIntent, type IntentWeight } from "@/lib/intent";
import { INTENT_POINTS as POINTS, readIntent as read } from "@/lib/intent";

/** Convenience for callers that only have a raw value and want the points. */
export function intentPoints(raw: unknown): number {
  return POINTS[read(raw)];
}

/**
 * Move the contact's open lead, and leave a trail saying why.
 *
 * Only an OPEN lead is touched — a won or lost one is a closed record, and
 * re-scoring it because someone browsed a menu afterwards would rewrite history.
 * Every bump writes a LeadActivity, so a score that moved always has a visible
 * reason rather than drifting upward for reasons nobody can reconstruct.
 *
 * Returns the points actually applied, which is 0 when there was no open lead to
 * move or the score was already capped.
 */
export async function applyIntentToLead(params: {
  tenantId: string;
  contactId: string;
  /** Shown in the activity line, e.g. the question or menu option chosen. */
  reason: string;
  points: number;
  /** LeadActivity.type — distinguishes a FAQ tap from a menu choice. */
  activityType: "FAQ_INTEREST" | "IVR_INTEREST";
}): Promise<number> {
  if (params.points <= 0) return 0;

  try {
    const lead = await prisma.lead.findFirst({
      where: {
        tenantId: params.tenantId,
        contactId: params.contactId,
        closedAt: null,
        // OPEN, not "not won" — a stage marked LOST is closed too.
        stage: { outcome: "OPEN" },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, score: true },
    });
    if (!lead) return 0;

    const next = Math.min(100, lead.score + params.points);
    if (next === lead.score) return 0;

    await prisma.$transaction([
      prisma.lead.update({
        where: { id: lead.id },
        data: { score: next, scoreLabel: scoreLabelFor(next) },
      }),
      prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          type: params.activityType,
          content: `${params.reason} (+${params.points})`,
          metadata: { reason: params.reason, points: params.points, from: lead.score, to: next },
        },
      }),
    ]);

    return next - lead.score;
  } catch (error) {
    // A lead signal is layered on top of a conversation that already worked.
    console.error("[LEAD SIGNAL] Failed to score lead:", error);
    return 0;
  }
}
