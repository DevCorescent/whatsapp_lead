import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runCampaign, CampaignClaimError } from "@/lib/campaigns/runner";

// A PATCH either renames the campaign (DRAFT only) or performs one scheduling
// action. Actions and rename are mutually exclusive per request.
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  action: z.enum(["schedule", "reschedule", "cancel", "retry", "send_now"]).optional(),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
}).strict().refine((d) => d.name !== undefined || d.action !== undefined, {
  message: "Nothing to update",
});

/** Run a campaign through the shared runner and return its refreshed record. */
async function runAndRespond(id: string) {
  try {
    await runCampaign(id);
  } catch (error) {
    if (error instanceof CampaignClaimError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    console.error("[CAMPAIGN RUN]", error);
    return NextResponse.json({ success: false, error: "Failed to send campaign" }, { status: 500 });
  }
  const updated = await prisma.campaign.findUnique({ where: { id } });
  return NextResponse.json({ success: true, data: updated });
}

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

    const { name, action, scheduledAt: scheduledAtRaw } = parsed.data;

    // ── Rename (DRAFT only) ─────────────────────────────────────────────────
    if (name !== undefined) {
      if (campaign.status !== "DRAFT") {
        return NextResponse.json({ success: false, error: "Can only rename DRAFT campaigns" }, { status: 400 });
      }
      const updated = await prisma.campaign.update({ where: { id }, data: { name } });
      return NextResponse.json({ success: true, data: updated });
    }

    // ── Actions ─────────────────────────────────────────────────────────────
    const status = campaign.status;

    if (action === "schedule" || action === "reschedule") {
      if (!scheduledAtRaw) {
        return NextResponse.json({ success: false, error: "scheduledAt is required" }, { status: 400 });
      }
      const when = new Date(scheduledAtRaw);
      if (when.getTime() <= Date.now()) {
        return NextResponse.json({ success: false, error: "Scheduled time must be in the future" }, { status: 400 });
      }
      if (status === "SENT" || status === "PROCESSING" || status === "COMPLETED" || status === "RUNNING") {
        return NextResponse.json({ success: false, error: "Cannot schedule a campaign that is sending or already sent" }, { status: 400 });
      }
      // Prevent duplicate scheduling: a SCHEDULED campaign must be rescheduled, not re-scheduled.
      if (action === "schedule" && status === "SCHEDULED") {
        return NextResponse.json({ success: false, error: "Campaign is already scheduled — use reschedule" }, { status: 400 });
      }
      if (action === "reschedule" && status !== "SCHEDULED") {
        return NextResponse.json({ success: false, error: "Only a scheduled campaign can be rescheduled" }, { status: 400 });
      }
      const updated = await prisma.campaign.update({
        where: { id },
        data: { status: "SCHEDULED", scheduledAt: when, lastError: null },
      });
      return NextResponse.json({ success: true, data: updated });
    }

    if (action === "cancel") {
      // Atomic guard: only a SCHEDULED campaign can be cancelled, and only if the
      // scheduler has not already claimed it (-> PROCESSING) in the meantime.
      const res = await prisma.campaign.updateMany({
        where: { id, tenantId, status: "SCHEDULED" },
        data: { status: "CANCELLED" },
      });
      if (res.count === 0) {
        return NextResponse.json({ success: false, error: "Only a scheduled campaign can be cancelled" }, { status: 400 });
      }
      const updated = await prisma.campaign.findUnique({ where: { id } });
      return NextResponse.json({ success: true, data: updated });
    }

    if (action === "retry") {
      if (status !== "FAILED") {
        return NextResponse.json({ success: false, error: "Only a failed campaign can be retried" }, { status: 400 });
      }
      // Reset the recipients that failed so the runner re-attempts only those.
      await prisma.campaignContact.updateMany({
        where: { campaignId: id, status: "FAILED" },
        data: { status: "PENDING", failedReason: null },
      });
      return await runAndRespond(id);
    }

    if (action === "send_now") {
      if (status === "SENT" || status === "PROCESSING" || status === "COMPLETED" || status === "RUNNING") {
        return NextResponse.json({ success: false, error: "Campaign is already sending or sent" }, { status: 400 });
      }
      return await runAndRespond(id);
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
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
