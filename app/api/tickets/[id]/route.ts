import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TicketStatus, TicketPriority } from "@prisma/client";
import { getBusinessScope } from "@/lib/business";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  status: z.nativeEnum(TicketStatus).optional(),
  priority: z.nativeEnum(TicketPriority).optional(),
  assignedToId: z.string().nullable().optional(),
  subject: z.string().min(1).optional(),
  department: z.string().nullable().optional(),
}).strict();

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, businessId } = scope;

  try {
    const { id } = await params;
    const ticket = await prisma.ticket.findFirst({
      where: { id, tenantId, businessId },
      include: {
        assignedTo: { select: { id: true, name: true, avatar: true } },
        conversation: {
          include: {
            contact: { select: { id: true, name: true, phone: true, email: true } },
            messages: {
              select: { id: true, direction: true, content: true, createdAt: true, isNote: true },
              orderBy: { createdAt: "desc" },
              take: 20,
            },
          },
        },
      },
    });

    if (!ticket) return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: ticket });
  } catch (error) {
    console.error("[TICKET GET]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch ticket" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, businessId } = scope;

  try {
    const { id } = await params;
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    const existing = await prisma.ticket.findFirst({ where: { id, tenantId, businessId } });
    if (!existing) return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });

    const { status, ...rest } = parsed.data;

    const ticket = await prisma.ticket.update({
      where: { id },
      data: {
        ...rest,
        ...(status !== undefined && { status }),
        ...(status === "RESOLVED" && { resolvedAt: new Date() }),
        ...(status === "CLOSED" && { closedAt: new Date() }),
        ...(status === "ASSIGNED" && parsed.data.assignedToId && { assignedToId: parsed.data.assignedToId }),
      },
      include: {
        assignedTo: { select: { id: true, name: true } },
        conversation: {
          select: { contact: { select: { id: true, name: true, phone: true } } },
        },
      },
    });

    return NextResponse.json({ success: true, data: ticket });
  } catch (error) {
    console.error("[TICKET PATCH]", error);
    return NextResponse.json({ success: false, error: "Failed to update ticket" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, businessId, role } = scope;

  try {
    const { id } = await params;
    // Only SUPER_ADMIN or TENANT_OWNER can delete tickets
    if (role !== "SUPER_ADMIN" && role !== "TENANT_OWNER") {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const existing = await prisma.ticket.findFirst({ where: { id, tenantId, businessId } });
    if (!existing) return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });

    await prisma.ticket.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[TICKET DELETE]", error);
    return NextResponse.json({ success: false, error: "Failed to delete ticket" }, { status: 500 });
  }
}
