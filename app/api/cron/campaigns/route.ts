import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWhatsAppCreds } from "@/lib/business";
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
    // Same resolver the interactive send path uses, so a campaign scheduled from a business with
    // its own WhatsApp number goes out on that number instead of falling back to the workspace's.
    const creds = await resolveWhatsAppCreds(campaign.businessId);

    // Mark RUNNING
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "RUNNING", startedAt: now },
    });

    // No channel to send on. Recording every recipient as FAILED is the honest outcome: the
    // previous behaviour marked them SENT without a send having happened, which reported a
    // successful broadcast that no customer ever received.
    if (!creds.phoneNumberId || !creds.apiKey) {
      const failedIds = campaign.contacts.map((cc) => cc.id);
      await prisma.campaignContact.updateMany({
        where: { id: { in: failedIds } },
        data: { status: "FAILED", failedReason: "WhatsApp is not connected for this workspace" },
      });
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          sentCount: 0,
          failedCount: failedIds.length,
        },
      });
      totalProcessed++;
      continue;
    }

    let sent = 0;
    let failed = 0;

    const message =
      campaign.metadata && typeof campaign.metadata === "object"
        ? ((campaign.metadata as Record<string, string>).message ?? "Hello from WhatsCRM")
        : "Hello from WhatsCRM";

    for (const cc of campaign.contacts) {
      const phone = cc.contact?.phone ?? cc.phone;
      try {
        const res = await sendTextMessage(creds.phoneNumberId, creds.apiKey, phone, message);
        // Stored so the webhook can attribute delivery receipts back to this recipient.
        const waMessageId = res.messages?.[0]?.id ?? null;
        await prisma.campaignContact.update({
          where: { id: cc.id },
          data: { status: "SENT", sentAt: now, waMessageId },
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
