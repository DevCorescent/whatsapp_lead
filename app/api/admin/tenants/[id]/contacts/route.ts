// ============================================================================
// ROUTE : /api/admin/tenants/[id]/contacts
//
// GET  - One account's contacts across all its businesses (search, status,
//        paginated), for the super admin's account page.
// POST - Delete / restore / block / unblock some of them:
//        { action, ids, reason? }. Blocking adds the number to THAT account's
//        blacklist; history rows are written to the super admin's account.
//
// SUPER_ADMIN only.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CONTACT_ACTION_MAX, applyContactAction, blacklistedContactPhones } from "@/lib/contactActions";

type Params = { params: Promise<{ id: string }> };

const STATUSES = ["active", "blocked", "deleted"] as const;

const postSchema = z.object({
  action: z.enum(["delete", "restore", "block", "unblock"]),
  ids: z.array(z.string().min(1)).min(1, "Select at least one contact").max(CONTACT_ACTION_MAX),
  reason: z.string().trim().max(500).optional(),
});

async function superAdmin() {
  const session = await auth();
  if (!session?.user) return { error: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
  if (session.user.role !== "SUPER_ADMIN") {
    return { error: NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }) };
  }
  return { user: session.user };
}

export async function GET(req: NextRequest, { params }: Params) {
  const { error } = await superAdmin();
  if (error) return error;
  const { id } = await params;

  const tenant = await prisma.tenant.findUnique({ where: { id }, select: { id: true } });
  if (!tenant) return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "25") || 25));
  const search = (searchParams.get("search") ?? "").trim();
  const digits = search.replace(/\D/g, "");
  const statusParam = searchParams.get("status") ?? "active";
  const status = (STATUSES as readonly string[]).includes(statusParam) ? statusParam : "active";

  const blockedPhones = await blacklistedContactPhones(id);
  const where: Prisma.ContactWhereInput = {
    tenantId: id,
    isBlocked: status === "deleted",
    ...(status === "blocked" && { phone: { in: blockedPhones } }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        ...(digits ? [{ phone: { contains: digits } }] : []),
        { email: { contains: search, mode: "insensitive" as const } },
      ],
    }),
  };

  try {
    const [total, contacts] = await Promise.all([
      prisma.contact.count({ where }),
      prisma.contact.findMany({
        where,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          isBlocked: true,
          optedOut: true,
          createdAt: true,
          business: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    const blocked = new Set(blockedPhones);
    return NextResponse.json({
      success: true,
      data: contacts.map((c) => ({ ...c, blacklisted: blocked.has(c.phone) })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("[ADMIN TENANT CONTACTS GET]", err);
    return NextResponse.json({ success: false, error: "Failed to load contacts" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const { user, error } = await superAdmin();
  if (error) return error;
  const { id } = await params;

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

  const tenant = await prisma.tenant.findUnique({ where: { id }, select: { id: true } });
  if (!tenant) return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 });

  try {
    const result = await applyContactAction({
      tenantId: id,
      ids: parsed.data.ids,
      action: parsed.data.action,
      reason: parsed.data.reason,
      userId: user!.id,
      auditTenantId: (user!.viewAs?.homeTenantId ?? user!.tenantId),
    });
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error("[ADMIN TENANT CONTACTS POST]", err);
    return NextResponse.json({ success: false, error: "Failed to update the contacts" }, { status: 500 });
  }
}
