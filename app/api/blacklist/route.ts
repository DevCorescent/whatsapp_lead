// ============================================================================
// MODULE : Blacklist
// ROUTE  : /api/blacklist
//
// METHODS
// GET    - List blacklisted numbers (search, paginated)
// POST   - Blacklist one or more numbers, with an optional reason
//
// ACCESS
// Account scope (default): GET needs blacklist.view, POST needs blacklist.manage.
//   Entries belong to the caller's account and apply to every business in it.
// `?scope=platform` / `{ scope: "platform" }`: SUPER_ADMIN only. Entries apply to
//   every account on the platform.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addToBlacklist } from "@/lib/blacklist";
import { can, requirePermission } from "@/lib/permissions";

const addSchema = z.object({
  phones: z.array(z.string().max(40)).min(1, "Enter at least one number").max(5000, "At most 5000 numbers at a time"),
  reason: z.string().trim().max(500).optional(),
  scope: z.enum(["account", "platform"]).default("account"),
});

function forbidden() {
  return NextResponse.json({ success: false, error: "Only super admins can manage the platform blacklist" }, { status: 403 });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const scopeParam = searchParams.get("scope");
  const platform = scopeParam === "platform";
  const allAccounts = scopeParam === "all";

  if ((platform || allAccounts) && session.user.role !== "SUPER_ADMIN") return forbidden();
  if (!platform && !allAccounts) {
    const denied = await requirePermission(session.user, "blacklist.view");
    if (denied) return denied;
  }

  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50") || 50));
  const search = (searchParams.get("search") ?? "").trim();
  const digits = search.replace(/\D/g, "");

  // ── All-accounts view: every tenant's entries in one list ─────────────────
  if (allAccounts) {
    const where = {
      tenantId: { not: null as string | null },
      ...(search && {
        OR: [
          ...(digits ? [{ phone: { contains: digits } }] : []),
          { reason: { contains: search, mode: "insensitive" as const } },
          { tenant: { name: { contains: search, mode: "insensitive" as const } } },
        ],
      }),
    };
    try {
      const [total, entries] = await Promise.all([
        prisma.blacklistEntry.count({ where }),
        prisma.blacklistEntry.findMany({
          where,
          select: {
            id: true,
            phone: true,
            reason: true,
            createdAt: true,
            createdBy: { select: { id: true, name: true } },
            tenant: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);
      return NextResponse.json({
        success: true,
        data: entries.map((e) => ({
          id: e.id,
          phone: e.phone,
          reason: e.reason,
          createdAt: e.createdAt,
          createdBy: e.createdBy,
          contactName: null,
          tenantName: e.tenant?.name ?? null,
        })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        canManage: true,
      });
    } catch (error) {
      console.error("[BLACKLIST GET ALL]", error);
      return NextResponse.json({ success: false, error: "Failed to load the blacklist" }, { status: 500 });
    }
  }

  const where = {
    tenantId: platform ? null : session.user.tenantId,
    ...(search && {
      OR: [
        ...(digits ? [{ phone: { contains: digits } }] : []),
        { reason: { contains: search, mode: "insensitive" as const } },
      ],
    }),
  };

  try {
    const [total, entries] = await Promise.all([
      prisma.blacklistEntry.count({ where }),
      prisma.blacklistEntry.findMany({
        where,
        select: {
          id: true,
          phone: true,
          reason: true,
          createdAt: true,
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Show which blacklisted numbers are saved contacts, so a name can be put to them.
    const contacts = platform || entries.length === 0
      ? []
      : await prisma.contact.findMany({
          where: { tenantId: session.user.tenantId, phone: { in: entries.map((e) => e.phone) } },
          select: { phone: true, name: true },
        });
    const nameByPhone = new Map(contacts.map((c) => [c.phone, c.name]));

    return NextResponse.json({
      success: true,
      data: entries.map((e) => ({ ...e, contactName: nameByPhone.get(e.phone) ?? null })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      // Lets the page hide add/remove controls from roles that can only view.
      canManage: platform || await can(session.user, "blacklist.manage"),
    });
  } catch (error) {
    console.error("[BLACKLIST GET]", error);
    return NextResponse.json({ success: false, error: "Failed to load the blacklist" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
  }

  const platform = parsed.data.scope === "platform";
  if (platform && session.user.role !== "SUPER_ADMIN") return forbidden();
  if (!platform) {
    const denied = await requirePermission(session.user, "blacklist.manage");
    if (denied) return denied;
  }

  try {
    const result = await addToBlacklist({
      tenantId: platform ? null : session.user.tenantId,
      phones: parsed.data.phones,
      reason: parsed.data.reason,
      userId: session.user.id,
      auditTenantId: session.user.tenantId,
    });

    if (result.added.length === 0 && result.alreadyListed.length === 0) {
      return NextResponse.json(
        { success: false, error: "None of those are valid phone numbers", data: result },
        { status: 400 },
      );
    }
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    console.error("[BLACKLIST POST]", error);
    return NextResponse.json({ success: false, error: "Failed to update the blacklist" }, { status: 500 });
  }
}
