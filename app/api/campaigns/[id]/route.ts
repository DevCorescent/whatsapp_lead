import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendTextMessage } from "@/lib/whatsapp";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(["RUNNING", "PAUSED", "COMPLETED"]).optional(),
}).strict();

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  try {
    const { id } = await params;
    const campaign = await prisma.campaign.findFirst({
      where: { id, tenantId },
      include: {
        template: true,
        contacts: {
          include: { contact: { select: { id: true, name: true, phone: true } } },
          orderBy: { sentAt: "desc" },
          take: 100,
        },
      },
    });

    if (!campaign) return NextResponse.json({ success: false, error: "Campaign not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: campaign });
  } catch (error) {
    console.error("[CAMPAIGN GET]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch campaign" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  try {
    const { id } = await params;
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    const campaign = await prisma.campaign.findFirst({ where: { id, tenantId } });
    if (!campaign) return NextResponse.json({ success: false, error: "Campaign not found" }, { status: 404 });

    // Only allow name change on DRAFT campaigns
    if (parsed.data.name && campaign.status !== "DRAFT") {
      return NextResponse.json({ success: false, error: "Can only rename DRAFT campaigns" }, { status: 400 });
    }

    // If campaign has a future scheduledAt, set SCHEDULED instead of sending now
    if (parsed.data.status === "RUNNING" && campaign.status === "DRAFT" && campaign.scheduledAt && campaign.scheduledAt > new Date()) {
      const updated = await prisma.campaign.update({
        where: { id },
        data: { status: "SCHEDULED" },
      });
      return NextResponse.json({ success: true, data: updated });
    }

    // If launching (DRAFT → RUNNING), send messages inline
    if (parsed.data.status === "RUNNING" && campaign.status === "DRAFT") {
      // Get WhatsApp credentials
      const settings = await prisma.tenantSettings.findUnique({
        where: { tenantId },
        select: { waPhoneNumberId: true, waApiKey: true },
      });

      // Get pending contacts
      const pendingContacts = await prisma.campaignContact.findMany({
        where: { campaignId: id, status: "PENDING" },
        include: { contact: { select: { phone: true } } },
      });

      if (settings?.waPhoneNumberId && settings?.waApiKey && pendingContacts.length > 0) {
        // Update campaign to RUNNING
        await prisma.campaign.update({
          where: { id },
          data: { status: "RUNNING", startedAt: new Date() },
        });

        // Send messages inline (no queue)
        let sent = 0;
        let failed = 0;
        for (const cc of pendingContacts) {
          const phone = cc.contact?.phone ?? cc.phone;
          try {
            const message = campaign.metadata && typeof campaign.metadata === "object"
              ? (campaign.metadata as Record<string, string>).message ?? "Hello from WhatsCRM"
              : "Hello from WhatsCRM";
            await sendTextMessage(settings.waPhoneNumberId, settings.waApiKey, phone, message);
            await prisma.campaignContact.update({
              where: { id: cc.id },
              data: { status: "SENT", sentAt: new Date() },
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

        const updated = await prisma.campaign.update({
          where: { id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            sentCount: sent,
            failedCount: failed,
          },
        });
        return NextResponse.json({ success: true, data: updated });
      }
    }

    const updated = await prisma.campaign.update({
      where: { id },
      data: {
        ...(parsed.data.name && { name: parsed.data.name }),
        ...(parsed.data.status && { status: parsed.data.status }),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[CAMPAIGN PATCH]", error);
    return NextResponse.json({ success: false, error: "Failed to update campaign" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  try {
    const { id } = await params;
    const campaign = await prisma.campaign.findFirst({ where: { id, tenantId } });
    if (!campaign) return NextResponse.json({ success: false, error: "Campaign not found" }, { status: 404 });
    if (campaign.status !== "DRAFT") return NextResponse.json({ success: false, error: "Only DRAFT campaigns can be deleted" }, { status: 400 });

    await prisma.campaign.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CAMPAIGN DELETE]", error);
    return NextResponse.json({ success: false, error: "Failed to delete campaign" }, { status: 500 });
  }
}
