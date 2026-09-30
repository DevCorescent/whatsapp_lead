// ============================================================================
// MODULE : Blacklist
// ROUTE  : /api/blacklist/[id]
//
// METHODS
// DELETE - Unblock a number. The removal (and the original reason) is kept in the
//          audit history. Optional `?note=` records why it was unblocked.
//
// ACCESS
// Account entries: blacklist.manage, own account only (another account's entry 404s).
// Platform entries: SUPER_ADMIN only.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { removeFromBlacklist } from "@/lib/blacklist";
import { requirePermission } from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const isSuperAdmin = session.user.role === "SUPER_ADMIN";

  const entry = await prisma.blacklistEntry.findFirst({
    // Tenant-scoped in the query: an id from another account is indistinguishable from a
    // missing one. Super admins can also reach platform-wide (tenantId null) entries.
    where: {
      id,
      OR: [{ tenantId: session.user.tenantId }, ...(isSuperAdmin ? [{ tenantId: null }] : [])],
    },
    select: { id: true, phone: true, tenantId: true, reason: true },
  });
  if (!entry) return NextResponse.json({ success: false, error: "Entry not found" }, { status: 404 });

  if (entry.tenantId !== null) {
    const denied = await requirePermission(session.user, "blacklist.manage");
    if (denied) return denied;
  }

  try {
    await removeFromBlacklist({
      entry,
      userId: session.user.id,
      auditTenantId: session.user.tenantId,
      note: new URL(req.url).searchParams.get("note"),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[BLACKLIST DELETE]", error);
    return NextResponse.json({ success: false, error: "Failed to remove the entry" }, { status: 500 });
  }
}
