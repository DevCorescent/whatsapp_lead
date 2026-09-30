// ============================================================================
// ROUTE : /api/cron/campaigns  (GET, Vercel cron)
//
// Safety net for campaign sends. Launch already queues every recipient (scheduled
// ones with a QStash delay), so normally this finds nothing. It catches:
//   · due SCHEDULED campaigns whose delayed jobs never ran (e.g. a failed publish);
//   · RUNNING campaigns left with PENDING recipients an hour after starting (a
//     batch that failed to publish, or jobs QStash gave up on before settling).
//
// Re-queuing is safe: the worker claims a recipient before sending, so a recipient
// that still has an older job in flight is never messaged twice. Jobs are built by
// lib/campaigns/jobs.ts — the same builder launch uses — so media headers and
// personalised variables survive (this route used to rebuild jobs and drop them).
//
// ACCESS: `Authorization: Bearer $CRON_SECRET`. Refused outright when the secret is
// unset — otherwise the literal header "Bearer undefined" would have been accepted.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { queuePendingRecipients } from "@/lib/campaigns/jobs";

export const maxDuration = 60;

const STALE_RUNNING_MS = 60 * 60_000;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    console.warn("[CRON CAMPAIGNS] Auth failed — CRON_SECRET missing or wrong");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  try {
    const due = await prisma.campaign.findMany({
      where: {
        OR: [
          { status: "SCHEDULED", scheduledAt: { lte: now } },
          { status: "RUNNING", startedAt: { lte: new Date(now.getTime() - STALE_RUNNING_MS) } },
        ],
        contacts: { some: { status: "PENDING" } },
      },
      select: { id: true, status: true },
      take: 50,
    });

    // Scheduled campaigns that came due with nobody left to send to are simply finished.
    await prisma.campaign.updateMany({
      where: {
        status: "SCHEDULED",
        scheduledAt: { lte: now },
        contacts: { none: { status: { in: ["PENDING", "SENDING"] } } },
      },
      data: { status: "COMPLETED", completedAt: now },
    });

    let queued = 0;
    for (const campaign of due) {
      if (campaign.status === "SCHEDULED") {
        await prisma.campaign.updateMany({
          where: { id: campaign.id, status: "SCHEDULED" },
          data: { status: "RUNNING", startedAt: now },
        });
      }
      const { published } = await queuePendingRecipients(campaign.id);
      queued += published;
    }

    console.log("[CRON CAMPAIGNS] Done", { campaigns: due.length, queued });
    return NextResponse.json({ success: true, processed: due.length, queued });
  } catch (error) {
    console.error("[CRON CAMPAIGNS] Failed", { error: String(error) });
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}
