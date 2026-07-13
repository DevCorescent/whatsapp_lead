import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { LeadStage } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scoreLabelFor } from "@/lib/utils";

const updateLeadSchema = z.object({
  title: z.string().min(1).optional(),
  stage: z.nativeEnum(LeadStage).optional(),
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

    const existing = await prisma.lead.findFirst({ where: { id, tenantId } });
    if (!existing) return NextResponse.json({ success: false, error: "Lead not found" }, { status: 404 });

    const { stage, score, ...rest } = parsed.data;

    const lead = await prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id },
        data: {
          ...rest,
          ...(stage !== undefined && { stage }),
          ...(score !== undefined && { score, scoreLabel: scoreLabelFor(score) }),
          ...((stage === "WON" || stage === "LOST") && { closedAt: new Date() }),
          ...(stage !== "WON" && stage !== "LOST" && existing.closedAt && stage !== undefined && { closedAt: null }),
        },
        include: {
          contact: { select: { id: true, name: true, phone: true } },
          assignedTo: { select: { id: true, name: true } },
        },
      });

      if (stage && stage !== existing.stage) {
        await tx.leadActivity.create({
          data: {
            leadId: id,
            userId,
            type: "STAGE_CHANGED",
            content: `Stage changed from ${existing.stage.replace(/_/g, " ")} to ${stage.replace(/_/g, " ")}`,
            metadata: { oldStage: existing.stage, newStage: stage },
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
