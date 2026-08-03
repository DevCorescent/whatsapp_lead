import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publishCampaignSend } from "@/lib/queue";

export async function GET(req: NextRequest) {
  console.log("[CRON CAMPAIGNS] Tick received", {
    CRON_SECRET_SET: Boolean(process.env.CRON_SECRET),
    QSTASH_TOKEN_SET: Boolean(process.env.QSTASH_TOKEN),
    DATABASE_URL_SET: Boolean(process.env.DATABASE_URL),
    APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "(not set — using hardcoded fallback)",
  });

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.warn("[CRON CAMPAIGNS] Auth failed — wrong or missing CRON_SECRET");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[CRON CAMPAIGNS] Auth OK — querying due campaigns");

  const now = new Date();

  let dueCampaigns;
  try {
    dueCampaigns = await prisma.campaign.findMany({
      where: { status: "SCHEDULED", scheduledAt: { lte: now } },
      include: {
        contacts: {
          where: { status: "PENDING" },
          include: { contact: { select: { phone: true } } },
        },
      },
    });
    console.log("[CRON CAMPAIGNS] DB query OK", { dueCampaignCount: dueCampaigns.length });
  } catch (error) {
    console.error("[CRON CAMPAIGNS] DB query failed", { error: String(error) });
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  if (dueCampaigns.length === 0) {
    console.log("[CRON CAMPAIGNS] No due campaigns — done");
    return NextResponse.json({ success: true, processed: 0 });
  }

  let totalProcessed = 0;

  for (const campaign of dueCampaigns) {
    console.log("[CRON CAMPAIGNS] Processing campaign", { campaignId: campaign.id, recipientCount: campaign.contacts.length });

    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "RUNNING", startedAt: now },
    });

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

    for (const cc of campaign.contacts) {
      try {
        await publishCampaignSend({
          campaignId: campaign.id,
          recipientId: cc.id,
          phone: cc.contact?.phone ?? cc.phone,
          message,
          businessId: campaign.businessId,
        });
        console.log("[CRON CAMPAIGNS] Queued recipient", { recipientId: cc.id });
      } catch (error) {
        console.error("[CRON CAMPAIGNS] Failed to queue recipient", { recipientId: cc.id, error: String(error) });
      }
    }

    totalProcessed++;
  }

  console.log("[CRON CAMPAIGNS] Done", { totalProcessed });
  return NextResponse.json({ success: true, processed: totalProcessed });
}
