import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAssignRole, canManageMember } from "@/lib/roles";

/** Active owners left in an account if `excludingId` stopped being one. */
async function otherActiveOwners(tenantId: string, excludingId: string) {
  return prisma.user.count({ where: { tenantId, role: "TENANT_OWNER", isActive: true, id: { not: excludingId } } });
}

const updateSchema = z.object({
  role: z.nativeEnum(UserRole).optional(),
  isActive: z.boolean().optional(),
  name: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  /**
   * This agent's per-period share of the workspace AI credits.
   *
   * Null clears the cap and returns them to the shared pool — the difference
   * between "no allowance left" and "no personal allowance set" is the whole
   * point of the column, so it has to be settable back to null rather than to 0.
   * Zero is a real value here and means "no AI at all for this agent".
   */
  aiCreditLimit: z.number().int().nonnegative().max(1_000_000).nullable().optional(),
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

    // Only members ranked below the caller (owners manage everyone), and only to roles
    // below the caller — never SUPER_ADMIN. See lib/roles.ts.
    if (!canManageMember(callerRole, member.role)) {
      return NextResponse.json({ success: false, error: "You can't change this member" }, { status: 403 });
    }
    if (parsed.data.role !== undefined && parsed.data.role !== member.role && !canAssignRole(callerRole, parsed.data.role)) {
      return NextResponse.json({ success: false, error: "You can't give that role" }, { status: 403 });
    }
    // An account must keep at least one active owner.
    const losingOwner =
      member.role === "TENANT_OWNER" &&
      ((parsed.data.role !== undefined && parsed.data.role !== "TENANT_OWNER") || parsed.data.isActive === false);
    if (losingOwner && (await otherActiveOwners(tenantId, member.id)) === 0) {
      return NextResponse.json({ success: false, error: "The account needs at least one active owner" }, { status: 409 });
    }

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
        aiCreditLimit: true,
        aiCreditsUsed: true,
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
    if (!canManageMember(callerRole, member.role)) {
      return NextResponse.json({ success: false, error: "You can't remove this member" }, { status: 403 });
    }
    if (member.role === "TENANT_OWNER" && (await otherActiveOwners(tenantId, member.id)) === 0) {
      return NextResponse.json({ success: false, error: "The account needs at least one active owner" }, { status: 409 });
    }

    // Soft delete — deactivate
    await prisma.user.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[TEAM DELETE]", error);
    return NextResponse.json({ success: false, error: "Failed to remove team member" }, { status: 500 });
  }
}
