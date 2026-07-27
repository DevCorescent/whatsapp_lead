import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publishCampaignSend } from "@/lib/queue";

// Vercel Cron calls this every minute. It finds SCHEDULED campaigns whose scheduledAt has passed
// and publishes one job per pending recipient.
//
// This route triggers a campaign; it does not send it. Sending belongs to
// /api/workers/campaign-send, which is the single path a campaign message can take — the same one
// an immediate campaign from /api/campaigns uses. The inline loop that used to live here was a
// second, parallel implementation of sending, with its own credential handling, its own one-attempt
// failure semantics and its own counters, none of which matched the worker's.
export async function GET(req: NextRequest) {
  // Protect the cron endpoint from public access
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const dueCampaigns = await prisma.campaign.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { lte: now },
    },
    include: {
      contacts: {
        where: { status: "PENDING" },
        include: { contact: { select: { phone: true } } },
      },
    },
  });

  if (dueCampaigns.length === 0) {
    return NextResponse.json({ success: true, processed: 0 });
  }

  let totalProcessed = 0;

  for (const campaign of dueCampaigns) {
    // Mark RUNNING
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "RUNNING", startedAt: now },
    });

    // A campaign whose recipients have all already settled would have no job left to close it out,
    // so it is completed here rather than left RUNNING forever.
    if (campaign.contacts.length === 0) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      totalProcessed++;
      continue;
    }

    const message =
      campaign.metadata && typeof campaign.metadata === "object"
        ? ((campaign.metadata as Record<string, string>).message ?? "Hello from WhatsCRM")
        : "Hello from WhatsCRM";

    // Credentials are deliberately not resolved here. The worker resolves them per recipient and,
    // when a workspace has no connected number, settles that recipient FAILED with the same reason
    // this route used to write in bulk — reaching the same end state through one implementation
    // instead of two.
    for (const cc of campaign.contacts) {
      await publishCampaignSend({
        campaignId: campaign.id,
        recipientId: cc.id,
        phone: cc.contact?.phone ?? cc.phone,
        message,
        businessId: campaign.businessId,
      });
    }

    totalProcessed++;
  }

  return NextResponse.json({ success: true, processed: totalProcessed });
}
