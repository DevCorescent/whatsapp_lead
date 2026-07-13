import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { LeadStage, LeadScoreLabel } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scoreLabelFor } from "@/lib/utils";

const querySchema = z.object({
  stage: z.nativeEnum(LeadStage).optional(),
  assigneeId: z.string().optional(),
  scoreLabel: z.nativeEnum(LeadScoreLabel).optional(),
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
});

const createLeadSchema = z.object({
  contactId: z.string().min(1, "Contact is required"),
  title: z.string().min(1, "Title is required"),
  stage: z.nativeEnum(LeadStage).default("NEW_LEAD"),
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
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  try {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      stage: searchParams.get("stage") ?? undefined,
      assigneeId: searchParams.get("assigneeId") ?? undefined,
      scoreLabel: searchParams.get("scoreLabel") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { stage, assigneeId, scoreLabel, search, page, limit } = parsed.data;

    const where = {
      tenantId,
      ...(stage !== undefined && { stage }),
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
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, id: userId } = session.user;

  try {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

    const parsed = createLeadSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    const data = parsed.data;

    // Verify contact belongs to tenant
    const contact = await prisma.contact.findFirst({ where: { id: data.contactId, tenantId } });
    if (!contact) return NextResponse.json({ success: false, error: "Contact not found" }, { status: 404 });

    const scoreLabel = scoreLabelFor(data.score ?? 0);
    const lead = await prisma.$transaction(async (tx) => {
      const created = await tx.lead.create({
        data: {
          tenantId,
          contactId: data.contactId,
          title: data.title,
          stage: data.stage,
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
