// ============================================================================
// MODULE : Blacklist
// ROUTE  : /api/blacklist/history
//
// METHODS
// GET    - Who blacklisted or unblocked which number, when and why. Newest first.
//          `?phone=` narrows to one number; `?scope=platform` (SUPER_ADMIN) shows the
//          platform-wide list's history.
//
// ACCESS
// blacklist.view for the account's own history. Read from AuditLog, which the
// blacklist module writes on every add and removal.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/import";
import { requirePermission } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const platform = searchParams.get("scope") === "platform";
  if (platform && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }
  if (!platform) {
    const denied = await requirePermission(session.user, "blacklist.view");
    if (denied) return denied;
  }

  const phone = searchParams.get("phone");
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "100") || 100));

  try {
    const rows = await prisma.auditLog.findMany({
      where: {
        tenantId: session.user.tenantId,
        resource: "blacklist",
        metadata: { path: ["scope"], equals: platform ? "platform" : "account" },
        ...(phone && { resourceId: normalizePhone(phone) }),
      },
      select: {
        id: true,
        action: true,
        resourceId: true,
        metadata: true,
        createdAt: true,
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({
      success: true,
      data: rows.map((r) => {
        const meta = (r.metadata ?? {}) as { reason?: string | null; note?: string | null };
        return {
          id: r.id,
          action: r.action === "BLACKLIST_ADDED" ? "added" : "removed",
          phone: r.resourceId,
          reason: meta.reason ?? null,
          note: meta.note ?? null,
          by: r.user,
          at: r.createdAt,
        };
      }),
    });
  } catch (error) {
    console.error("[BLACKLIST HISTORY]", error);
    return NextResponse.json({ success: false, error: "Failed to load history" }, { status: 500 });
  }
}
