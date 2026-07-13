import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TicketStatus, TicketPriority } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  status: z.nativeEnum(TicketStatus).optional(),
  priority: z.nativeEnum(TicketPriority).optional(),
  assigneeId: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

const createTicketSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  priority: z.nativeEnum(TicketPriority).default("MEDIUM"),
  department: z.string().optional(),
  conversationId: z.string().optional(),
});

function slaDeadline(priority: TicketPriority): Date {
  const hours = { URGENT: 4, HIGH: 24, MEDIUM: 48, LOW: 72 }[priority];
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  try {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      status: searchParams.get("status") ?? undefined,
      priority: searchParams.get("priority") ?? undefined,
      assigneeId: searchParams.get("assigneeId") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    const { status, priority, assigneeId, page, limit } = parsed.data;
    const where = {
      tenantId,
      ...(status !== undefined && { status }),
      ...(priority !== undefined && { priority }),
      ...(assigneeId !== undefined && { assignedToId: assigneeId }),
    };

    const [total, tickets] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.findMany({
        where,
        include: {
          assignedTo: { select: { id: true, name: true, avatar: true } },
          conversation: {
            select: {
              id: true,
              contact: { select: { id: true, name: true, phone: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: tickets,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("[TICKETS GET]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch tickets" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  try {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

    const parsed = createTicketSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    const { subject, priority, department, conversationId } = parsed.data;

    // If conversationId provided, verify it belongs to this tenant
    if (conversationId) {
      const conv = await prisma.conversation.findFirst({ where: { id: conversationId, tenantId } });
      if (!conv) return NextResponse.json({ success: false, error: "Conversation not found" }, { status: 404 });
      // Check if ticket already exists for this conversation
      const existingTicket = await prisma.ticket.findUnique({ where: { conversationId } });
      if (existingTicket) return NextResponse.json({ success: false, error: "Ticket already exists for this conversation" }, { status: 409 });
    }

    // Auto-assign to agent with fewest open tickets
    const agents = await prisma.user.findMany({
      where: { tenantId, role: { in: ["AGENT", "MANAGER", "ADMIN"] }, isActive: true },
      select: {
        id: true,
        _count: { select: { assignedTickets: { where: { status: { notIn: ["RESOLVED", "CLOSED"] } } } } },
      },
    });

    const assignedAgent = agents.sort((a, b) => a._count.assignedTickets - b._count.assignedTickets)[0];
    const assignedToId = assignedAgent?.id;

    const ticket = await prisma.ticket.create({
      data: {
        tenantId,
        subject,
        priority,
        ...(department && { department }),
        ...(conversationId && { conversationId }),
        ...(assignedToId && { assignedToId, status: "ASSIGNED" }),
        slaDeadline: slaDeadline(priority),
      },
      include: {
        assignedTo: { select: { id: true, name: true } },
        conversation: {
          select: {
            id: true,
            contact: { select: { id: true, name: true, phone: true } },
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: ticket }, { status: 201 });
  } catch (error) {
    console.error("[TICKETS POST]", error);
    return NextResponse.json({ success: false, error: "Failed to create ticket" }, { status: 500 });
  }
}
