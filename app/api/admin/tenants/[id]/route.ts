import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicTenantSettings } from "@/lib/publicSettings";

type Params = { params: Promise<{ id: string }> };

/**
 * What a super-admin may change about a workspace from this route.
 *
 * Strict, so a request carrying a plan, a slug or a settings blob is refused
 * rather than silently dropped — this endpoint used to cast the body and hand it
 * straight to Prisma, which meant an unexpected type became a 500 and an empty
 * name became a nameless workspace.
 *
 * Everything else about a tenant belongs to another workflow: the plan to
 * PUT ./subscription, the workspace's own settings to /api/settings, and
 * id/slug/createdAt to nothing at all.
 */
const updateTenantSchema = z
  .object({
    name: z.string().trim().min(1, "Workspace name cannot be empty").max(120).optional(),
    /** Suspends or restores the workspace. Every member is locked out while false. */
    isActive: z.boolean().optional(),
    /** The account's business category; null clears it. */
    categoryId: z.string().min(1).nullable().optional(),
    // ── Hierarchy ──
    accountType: z.enum(["CLIENT", "RESELLER"]).optional(),
    resellerType: z.enum(["NORMAL", "WHITE_LABEL"]).optional(),
    /** For a client: the reseller that manages it; null makes it a direct client. */
    parentId: z.string().min(1).nullable().optional(),
    /** For a client: the reseller credited with it (commission); null clears it. */
    referredById: z.string().min(1).nullable().optional(),
    commissionRate: z.number().min(0).max(100).optional(),
    /** Accepted only to return a clear error; see below. */
    planId: z.string().optional(),
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Nothing to update",
  });

export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true } },
      parent: { select: { id: true, name: true, resellerType: true } },
      referredBy: { select: { id: true, name: true } },
      whiteLabel: { select: { brandName: true, domain: true, isActive: true } },
      subscription: { include: { plan: { include: { ownerTenant: { select: { id: true, name: true } } } } } },
      settings: true,
      _count: { select: { users: true, contacts: true, leads: true, conversations: true, children: true } },
      users: {
        select: { id: true, name: true, email: true, phone: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
        orderBy: { createdAt: "asc" },
        take: 20,
      },
    },
  });

  if (!tenant) return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 });

  const { settings, ...rest } = tenant;

  return NextResponse.json({
    success: true,
    data: {
      ...rest,
      settings: settings ? publicTenantSettings(settings, null) : null,
    },
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateTenantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }
  const { isActive, name, planId, categoryId, accountType, resellerType, parentId, referredById, commissionRate } = parsed.data;

  // ── The Super Admin's own account ──
  // Suspending it, or turning it into a reseller (which has no workspace), would lock
  // every Super Admin out — so neither is allowed, from the UI or the API.
  const homeTenantId = session.user.viewAs?.homeTenantId ?? session.user.tenantId;
  const ownsSuperAdmins =
    tenant.id === homeTenantId ||
    (await prisma.user.count({ where: { tenantId: tenant.id, role: "SUPER_ADMIN" } })) > 0;
  if ((tenant.accountType === "PLATFORM" || ownsSuperAdmins) && (isActive === false || accountType === "RESELLER")) {
    return NextResponse.json(
      { success: false, error: "This is the platform's own account — it can't be suspended or made a reseller" },
      { status: 400 },
    );
  }

  // ── Hierarchy rules ──
  if (tenant.accountType === "PLATFORM" && (accountType || parentId || resellerType)) {
    return NextResponse.json({ success: false, error: "The platform account's type can't be changed" }, { status: 400 });
  }
  const nextType = accountType ?? tenant.accountType;
  if (nextType === "CLIENT" && tenant.accountType === "RESELLER") {
    const children = await prisma.tenant.count({ where: { parentId: tenant.id } });
    if (children > 0) {
      return NextResponse.json(
        { success: false, error: `This reseller still manages ${children} client(s) — move them first` },
        { status: 409 },
      );
    }
  }
  if (nextType === "RESELLER") {
    if (parentId) return NextResponse.json({ success: false, error: "A reseller can't sit under another reseller" }, { status: 400 });
    if (!resellerType && !tenant.resellerType) {
      return NextResponse.json({ success: false, error: "Choose NORMAL or WHITE_LABEL for a reseller" }, { status: 400 });
    }
  }
  for (const ref of [parentId, referredById]) {
    if (!ref) continue;
    if (nextType !== "CLIENT") {
      return NextResponse.json({ success: false, error: "Only client accounts can belong to a reseller" }, { status: 400 });
    }
    if (ref === tenant.id) return NextResponse.json({ success: false, error: "An account can't be its own reseller" }, { status: 400 });
    const reseller = await prisma.tenant.findFirst({ where: { id: ref, accountType: "RESELLER" }, select: { id: true } });
    if (!reseller) return NextResponse.json({ success: false, error: "Reseller not found" }, { status: 400 });
  }
  if (commissionRate !== undefined && nextType !== "RESELLER") {
    return NextResponse.json({ success: false, error: "Only resellers earn commission" }, { status: 400 });
  }

  if (categoryId) {
    const exists = await prisma.businessCategory.findUnique({ where: { id: categoryId }, select: { id: true } });
    if (!exists) return NextResponse.json({ success: false, error: "Category not found" }, { status: 400 });
  }

  // Plan changes moved to PUT ./subscription. They were only ever half-done here
  // — the upsert hardcoded ACTIVE and a thirty-day window, so assigning a plan
  // through this route silently overwrote a negotiated period end and could not
  // express a trial or an annual cycle at all. Refused loudly rather than
  // quietly ignored, so a caller still sending planId finds out.
  if (planId !== undefined) {
    return NextResponse.json(
      { success: false, error: "Use PUT /api/admin/tenants/[id]/subscription to change the plan." },
      { status: 400 },
    );
  }

  const updated = await prisma.tenant.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(isActive !== undefined && { isActive }),
      ...(categoryId !== undefined && { categoryId }),
      ...(accountType !== undefined && { accountType }),
      // Hierarchy fields follow the account type: a reseller has no parent; a client has no
      // reseller type or commission rate.
      ...(nextType === "RESELLER"
        ? {
            parentId: null,
            referredById: null,
            ...(resellerType !== undefined && { resellerType }),
            ...(commissionRate !== undefined && { commissionRate }),
          }
        : {
            resellerType: null,
            commissionRate: null,
            ...(parentId !== undefined && { parentId }),
            // Moving a client under a reseller credits that reseller unless told otherwise.
            ...(referredById !== undefined
              ? { referredById }
              : parentId && !tenant.referredById
                ? { referredById: parentId }
                : {}),
          }),
    },
  });

  // Suspending a workspace locks out every one of its users, so the change is
  // recorded against the tenant it affected, with the acting admin as the actor.
  await prisma.auditLog.create({
    data: {
      tenantId: updated.id,
      userId: session.user.id,
      action: isActive === undefined ? "TENANT_UPDATED" : isActive ? "TENANT_ACTIVATED" : "TENANT_SUSPENDED",
      resource: "tenant",
      resourceId: updated.id,
      metadata: {
        ...(name !== undefined && { name: { from: tenant.name, to: updated.name } }),
        ...(isActive !== undefined && { isActive: { from: tenant.isActive, to: updated.isActive } }),
        ...(updated.accountType !== tenant.accountType && { accountType: { from: tenant.accountType, to: updated.accountType } }),
        ...(updated.resellerType !== tenant.resellerType && { resellerType: { from: tenant.resellerType, to: updated.resellerType } }),
        ...(updated.parentId !== tenant.parentId && { parentId: { from: tenant.parentId, to: updated.parentId } }),
        ...(updated.referredById !== tenant.referredById && { referredById: { from: tenant.referredById, to: updated.referredById } }),
        ...(updated.commissionRate !== tenant.commissionRate && { commissionRate: { from: tenant.commissionRate, to: updated.commissionRate } }),
      },
    },
  });

  return NextResponse.json({ success: true, data: updated });
}
