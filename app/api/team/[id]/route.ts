import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  role: z.nativeEnum(UserRole).optional(),
  isActive: z.boolean().optional(),
  name: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
}).strict();

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, role: callerRole } = session.user;

  if (!["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"].includes(callerRole)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await params;
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    const member = await prisma.user.findFirst({ where: { id, tenantId } });
    if (!member) return NextResponse.json({ success: false, error: "Team member not found" }, { status: 404 });

    const updated = await prisma.user.update({
      where: { id },
      data: parsed.data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        phone: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[TEAM PATCH]", error);
    return NextResponse.json({ success: false, error: "Failed to update team member" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, id: callerId, role: callerRole } = session.user;

  if (!["SUPER_ADMIN", "TENANT_OWNER"].includes(callerRole)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await params;
    if (id === callerId) {
      return NextResponse.json({ success: false, error: "Cannot deactivate yourself" }, { status: 400 });
    }

    const member = await prisma.user.findFirst({ where: { id, tenantId } });
    if (!member) return NextResponse.json({ success: false, error: "Team member not found" }, { status: 404 });

    // Soft delete — deactivate
    await prisma.user.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[TEAM DELETE]", error);
    return NextResponse.json({ success: false, error: "Failed to remove team member" }, { status: 500 });
  }
}
