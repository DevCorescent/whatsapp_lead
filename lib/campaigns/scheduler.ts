// ============================================================================
// MODULE : Campaign scheduler
// ============================================================================
//
// The background worker's payload. `processDueCampaigns` finds every campaign
// that is due (status = SCHEDULED and scheduledAt <= now) across all tenants and
// runs each one through the shared `runCampaign`. It is invoked by the cron route
// (app/api/cron/campaigns) on a fixed interval.
//
// - Cancellation is honoured for free: a cancelled campaign is CANCELLED, not
//   SCHEDULED, so this query never selects it.
// - Duplicate protection lives in runCampaign's atomic claim; if two ticks
//   overlap, the second claim fails and the campaign is skipped, not resent.

import { prisma } from "@/lib/prisma";
import { runCampaign, CampaignClaimError } from "@/lib/campaigns/runner";

export interface ProcessResult {
  due: number;
  processed: { id: string; status: "SENT" | "FAILED" | "SKIPPED"; sent?: number; failed?: number }[];
}

export async function processDueCampaigns(now: Date = new Date()): Promise<ProcessResult> {
  const due = await prisma.campaign.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: now } },
    select: { id: true },
    orderBy: { scheduledAt: "asc" },
    take: 100,
  });

  const processed: ProcessResult["processed"] = [];

  // Sequential on purpose: keeps a burst of due campaigns from opening a large
  // number of concurrent WhatsApp connections in one tick.
  for (const { id } of due) {
    try {
      const result = await runCampaign(id);
      processed.push({ id, status: result.status, sent: result.sent, failed: result.failed });
    } catch (error) {
      if (error instanceof CampaignClaimError) {
        // Claimed/cancelled by someone else between the query and the claim — skip.
        processed.push({ id, status: "SKIPPED" });
        continue;
      }
      console.error(`[SCHEDULER] Campaign ${id} failed:`, error);
      processed.push({ id, status: "FAILED" });
    }
  }

  return { due: due.length, processed };
}
