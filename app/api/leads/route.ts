import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { LeadScoreLabel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";
import { scoreLabelFor } from "@/lib/utils";
import { defaultStageId } from "@/lib/pipelineStages";

/** The stage relation shape every lead read returns, so the UI never needs a second lookup. */
const STAGE_SELECT = {
  select: { id: true, name: true, color: true, order: true, enabled: true, outcome: true },
} as const;

const querySchema = z.object({
  stageId: z.string().optional(),
  assigneeId: z.string().optional(),
  scoreLabel: z.nativeEnum(LeadScoreLabel).optional(),
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
});

const createLeadSchema = z.object({
  contactId: z.string().min(1, "Contact is required"),
  title: z.string().min(1, "Title is required"),
  stageId: z.string().optional(),
  score: z.number().min(0).max(100).default(0),
  value: z.number().positive().optional(),
  currency: z.string().default("INR"),
  assignedToId: z.string().optional(),
  notes: z.string().optional(),
  budget: z.string().optional(),
  authority: z.string().optional(),
  requirement: z.string().optional(),
  timeline: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = scope;

  try {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      stageId: searchParams.get("stageId") ?? undefined,
      assigneeId: searchParams.get("assigneeId") ?? undefined,
      scoreLabel: searchParams.get("scoreLabel") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { stageId, assigneeId, scoreLabel, search, page, limit } = parsed.data;

    const where = {
      tenantId,
      ...(stageId !== undefined && { stageId }),
      ...(assigneeId !== undefined && { assignedToId: assigneeId }),
      ...(scoreLabel !== undefined && { scoreLabel }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: "insensitive" as const } },
          { contact: { name: { contains: search, mode: "insensitive" as const } } },
        ],
      }),
    };

    const [total, leads] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        include: {
          contact: { select: { id: true, name: true, phone: true, avatarUrl: true, company: true } },
          assignedTo: { select: { id: true, name: true, avatar: true } },
          stage: STAGE_SELECT,
          activities: {
            orderBy: { createdAt: "desc" },
            take: 5,
            include: { user: { select: { id: true, name: true } } },
          },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: leads,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("[LEADS GET]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch leads" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, businessId, userId } = scope;

  try {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

    const parsed = createLeadSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    const data = parsed.data;

    // Verify contact belongs to tenant
    const contact = await prisma.contact.findFirst({ where: { id: data.contactId, tenantId } });
    if (!contact) return NextResponse.json({ success: false, error: "Contact not found" }, { status: 404 });

    // Resolve the target stage. A caller-supplied stage must belong to this tenant and be
    // enabled — a disabled or foreign stage is refused rather than silently accepted. With no
    // stage given, the lead lands in the tenant's configured default (provisioned if needed).
    let stageId = data.stageId;
    if (stageId) {
      const stage = await prisma.pipelineStage.findFirst({ where: { id: stageId, tenantId } });
      if (!stage) return NextResponse.json({ success: false, error: "Stage not found" }, { status: 404 });
      if (!stage.enabled) {
        return NextResponse.json({ success: false, error: "Cannot assign a lead to a disabled stage" }, { status: 400 });
      }
    } else {
      stageId = await defaultStageId(tenantId);
    }

    const scoreLabel = scoreLabelFor(data.score ?? 0);
    const lead = await prisma.$transaction(async (tx) => {
      const created = await tx.lead.create({
        data: {
          tenantId,
          businessId,
          contactId: data.contactId,
          title: data.title,
          stageId,
          score: data.score ?? 0,
          scoreLabel,
          ...(data.value !== undefined && { value: data.value }),
          currency: data.currency,
          ...(data.assignedToId && { assignedToId: data.assignedToId }),
          ...(data.notes && { notes: data.notes }),
          ...(data.budget && { budget: data.budget }),
          ...(data.authority && { authority: data.authority }),
          ...(data.requirement && { requirement: data.requirement }),
          ...(data.timeline && { timeline: data.timeline }),
        },
        include: {
          contact: { select: { id: true, name: true, phone: true, company: true } },
          assignedTo: { select: { id: true, name: true } },
          stage: STAGE_SELECT,
        },
      });
      await tx.leadActivity.create({
        data: {
          leadId: created.id,
          userId,
          type: "CREATED",
          content: `Lead "${created.title}" created`,
        },
      });
      return created;
    });

    return NextResponse.json({ success: true, data: lead }, { status: 201 });
  } catch (error) {
    console.error("[LEADS POST]", error);
    return NextResponse.json({ success: false, error: "Failed to create lead" }, { status: 500 });
  }
}
