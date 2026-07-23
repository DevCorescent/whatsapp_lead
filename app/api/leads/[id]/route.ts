import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scoreLabelFor } from "@/lib/utils";

const STAGE_SELECT = {
  select: { id: true, name: true, color: true, order: true, enabled: true, outcome: true },
} as const;

const updateLeadSchema = z.object({
  title: z.string().min(1).optional(),
  stageId: z.string().optional(),
  score: z.number().min(0).max(100).optional(),
  value: z.number().positive().optional(),
  currency: z.string().optional(),
  assignedToId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  lostReason: z.string().optional(),
  budget: z.string().optional(),
  authority: z.string().optional(),
  requirement: z.string().optional(),
  timeline: z.string().optional(),
}).strict();

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  try {
    const { id } = await params;
    const lead = await prisma.lead.findFirst({
      where: { id, tenantId },
      include: {
        contact: { select: { id: true, name: true, phone: true, email: true, company: true, avatarUrl: true } },
        assignedTo: { select: { id: true, name: true, avatar: true } },
        stage: STAGE_SELECT,
        activities: {
          orderBy: { createdAt: "desc" },
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });

    if (!lead) return NextResponse.json({ success: false, error: "Lead not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: lead });
  } catch (error) {
    console.error("[LEAD GET]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch lead" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, id: userId } = session.user;

  try {
    const { id } = await params;
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

    const parsed = updateLeadSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    const existing = await prisma.lead.findFirst({
      where: { id, tenantId },
      include: { stage: STAGE_SELECT },
    });
    if (!existing) return NextResponse.json({ success: false, error: "Lead not found" }, { status: 404 });

    const { stageId, score, ...rest } = parsed.data;

    // A stage change must target one of this tenant's enabled stages. A foreign stage is a
    // 404 (indistinguishable from non-existent), a disabled one a 400 — neither is a valid
    // destination for a lead.
    let nextStage = existing.stage;
    if (stageId !== undefined && stageId !== existing.stageId) {
      const target = await prisma.pipelineStage.findFirst({
        where: { id: stageId, tenantId },
        select: STAGE_SELECT.select,
      });
      if (!target) return NextResponse.json({ success: false, error: "Stage not found" }, { status: 404 });
      if (!target.enabled) {
        return NextResponse.json({ success: false, error: "Cannot move a lead to a disabled stage" }, { status: 400 });
      }
      nextStage = target;
    }

    const stageChanged = nextStage.id !== existing.stageId;
    // `closedAt` follows the destination stage's outcome: stamped when it closes the deal
    // (WON/LOST), cleared when a lead is reopened back into an OPEN stage.
    const closesDeal = nextStage.outcome !== "OPEN";

    const lead = await prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id },
        data: {
          ...rest,
          ...(stageChanged && { stageId: nextStage.id }),
          ...(score !== undefined && { score, scoreLabel: scoreLabelFor(score) }),
          ...(stageChanged && closesDeal && { closedAt: new Date() }),
          ...(stageChanged && !closesDeal && existing.closedAt && { closedAt: null }),
        },
        include: {
          contact: { select: { id: true, name: true, phone: true } },
          assignedTo: { select: { id: true, name: true } },
          stage: STAGE_SELECT,
        },
      });

      if (stageChanged) {
        await tx.leadActivity.create({
          data: {
            leadId: id,
            userId,
            type: "STAGE_CHANGED",
            content: `Stage changed from ${existing.stage.name} to ${nextStage.name}`,
            metadata: { oldStageId: existing.stageId, newStageId: nextStage.id },
          },
        });
      }

      if (score !== undefined && score !== existing.score) {
        await tx.leadActivity.create({
          data: {
            leadId: id,
            userId,
            type: "SCORE_UPDATED",
            content: `Score updated from ${existing.score} to ${score}`,
          },
        });
      }

      return updated;
    });

    return NextResponse.json({ success: true, data: lead });
  } catch (error) {
    console.error("[LEAD PATCH]", error);
    return NextResponse.json({ success: false, error: "Failed to update lead" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  try {
    const { id } = await params;
    const existing = await prisma.lead.findFirst({ where: { id, tenantId } });
    if (!existing) return NextResponse.json({ success: false, error: "Lead not found" }, { status: 404 });

    await prisma.lead.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[LEAD DELETE]", error);
    return NextResponse.json({ success: false, error: "Failed to delete lead" }, { status: 500 });
  }
}
