import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTextMessage } from "@/lib/whatsapp";

// Vercel Cron calls this every minute. It finds SCHEDULED campaigns whose
// scheduledAt has passed and sends their messages.
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
    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId: campaign.tenantId },
      select: { waPhoneNumberId: true, waApiKey: true },
    });

    // Mark RUNNING
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "RUNNING", startedAt: now },
    });

    let sent = 0;
    let failed = 0;

    const message =
      campaign.metadata && typeof campaign.metadata === "object"
        ? ((campaign.metadata as Record<string, string>).message ?? "Hello from WhatsCRM")
        : "Hello from WhatsCRM";

    for (const cc of campaign.contacts) {
      const phone = cc.contact?.phone ?? cc.phone;
      try {
        if (settings?.waPhoneNumberId && settings?.waApiKey) {
          await sendTextMessage(settings.waPhoneNumberId, settings.waApiKey, phone, message);
        }
        await prisma.campaignContact.update({
          where: { id: cc.id },
          data: { status: "SENT", sentAt: now },
        });
        sent++;
      } catch {
        await prisma.campaignContact.update({
          where: { id: cc.id },
          data: { status: "FAILED", failedReason: "Send failed" },
        });
        failed++;
      }
    }

    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "COMPLETED", completedAt: new Date(), sentCount: sent, failedCount: failed },
    });

    totalProcessed++;
  }

  return NextResponse.json({ success: true, processed: totalProcessed });
}
