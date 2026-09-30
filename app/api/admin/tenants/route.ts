// ============================================================================
// ROUTE : /api/admin/tenants   (SUPER_ADMIN only)
//
// GET  - Every account, with its type (reseller / client), reseller type, parent
//        reseller, category, plan and usage. Filters: search, isActive, planId,
//        accountType, parentId.
// POST - Create an account: a direct client, a client under a reseller, or a
//        reseller (NORMAL or WHITE_LABEL, with a commission rate). The owner login
//        is a TENANT_OWNER with a CSPRNG temporary password (lib/provisioning.ts).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { AccountType, Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendInviteEmail } from "@/lib/email";
import { getBrandForTenant, PLATFORM_BRAND } from "@/lib/branding";
import { FREE_TIER_LIMITS, planLimits } from "@/lib/billing/tiers";
import { provisionAccount, ProvisioningError } from "@/lib/provisioning";

const ACCOUNT_TYPES: AccountType[] = ["PLATFORM", "RESELLER", "CLIENT"];

const createSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(120),
  slug: z.string().trim().max(60).optional(),
  ownerEmail: z.string().trim().email("ownerEmail must be a valid email"),
  ownerName: z.string().trim().max(120).optional(),
  accountType: z.enum(["CLIENT", "RESELLER"]).default("CLIENT"),
  resellerType: z.enum(["NORMAL", "WHITE_LABEL"]).optional(),
  /** For a client: the reseller it belongs to. */
  resellerId: z.string().min(1).nullable().optional(),
  commissionRate: z.number().min(0).max(100).optional(),
  categoryId: z.string().min(1).nullable().optional(),
  /** Plan by machine name (legacy) or id. Resellers get none unless one is given. */
  plan: z.string().optional(),
  planId: z.string().optional(),
  trialDays: z.number().int().min(0).max(90).optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20") || 20));
  const search = searchParams.get("search") ?? "";
  const isActiveParam = searchParams.get("isActive");
  const planFilter = searchParams.get("planId") ?? "";
  const typeParam = searchParams.get("accountType");
  const accountType = typeParam && ACCOUNT_TYPES.includes(typeParam as AccountType) ? (typeParam as AccountType) : null;
  const parentId = searchParams.get("parentId");

  const where: Prisma.TenantWhereInput = {
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { slug: { contains: search, mode: "insensitive" as const } },
      ],
    }),
    ...(isActiveParam !== null && isActiveParam !== "" && { isActive: isActiveParam === "true" }),
    ...(planFilter && { subscription: { plan: { name: { equals: planFilter.toUpperCase() } } } }),
    ...(accountType && { accountType }),
    ...(parentId && { parentId }),
  };

  const [total, tenants] = await Promise.all([
    prisma.tenant.count({ where }),
    prisma.tenant.findMany({
      where,
      include: {
        _count: { select: { users: true, contacts: true, leads: true, children: true } },
        // The whole plan row, because planLimits() maps it onto the limit shape the
        // rest of the app enforces. Only the display name and the message limit are
        // put on the response below — no plan internals reach the client.
        subscription: { include: { plan: true } },
        parent: { select: { id: true, name: true } },
        category: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  // Messages each workspace has sent this calendar month — the usage column's numerator.
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const tenantIds = tenants.map((t) => t.id);
  const messageCounts = tenantIds.length
    ? await prisma.message.groupBy({
        by: ["tenantId"],
        where: { tenantId: { in: tenantIds }, createdAt: { gte: startOfMonth } },
        _count: { _all: true },
      })
    : [];
  const messagesByTenant = new Map(messageCounts.map((row) => [row.tenantId, row._count._all]));

  const data = tenants.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    logo: t.logo,
    isActive: t.isActive,
    createdAt: t.createdAt.toISOString(),
    accountType: t.accountType,
    resellerType: t.resellerType,
    commissionRate: t.commissionRate,
    parent: t.parent,
    clients: t._count.children,
    category: t.category?.name ?? null,
    plan: t.subscription?.plan?.displayName ?? null,
    users: t._count.users,
    contacts: t._count.contacts,
    leads: t._count.leads,
    // A tenant with no subscription is on the implicit free tier, exactly as
    // resolveTenantPlan() treats it. 0 or less means unlimited (isUnlimited).
    messagesThisMonth: messagesByTenant.get(t.id) ?? 0,
    messageLimit: t.subscription
      ? planLimits(t.subscription.plan).messagesPerMonth
      : FREE_TIER_LIMITS.messagesPerMonth,
  }));

  return NextResponse.json({ success: true, data, pagination: { page, limit, total } });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
  }
  const input = parsed.data;

  if (input.accountType === "RESELLER" && !input.resellerType) {
    return NextResponse.json({ success: false, error: "Choose NORMAL or WHITE_LABEL for a reseller" }, { status: 400 });
  }

  // Plan: explicit id, else by machine name, else STARTER for clients. Resellers don't
  // message, so they get a plan only when one is asked for.
  let planId: string | null = null;
  if (input.planId) {
    planId = (await prisma.plan.findUnique({ where: { id: input.planId }, select: { id: true } }))?.id ?? null;
    if (!planId) return NextResponse.json({ success: false, error: "Plan not found" }, { status: 400 });
  } else if (input.plan || input.accountType === "CLIENT") {
    planId =
      (await prisma.plan.findFirst({ where: { name: (input.plan ?? "STARTER").toUpperCase() }, select: { id: true } }))?.id ??
      (await prisma.plan.findFirst({ where: { name: "STARTER" }, select: { id: true } }))?.id ??
      null;
    if (!planId && input.accountType === "CLIENT") {
      return NextResponse.json({ success: false, error: "No plans found in the database — run the seed first" }, { status: 500 });
    }
  }

  try {
    const { tenant, user, tempPassword } = await provisionAccount({
      name: input.name,
      slug: input.slug,
      ownerName: input.ownerName,
      ownerEmail: input.ownerEmail,
      accountType: input.accountType,
      resellerType: input.accountType === "RESELLER" ? input.resellerType : null,
      resellerId: input.accountType === "CLIENT" ? input.resellerId ?? null : null,
      commissionRate: input.commissionRate,
      categoryId: input.categoryId ?? null,
      planId,
      trialDays: input.trialDays ?? (input.accountType === "CLIENT" ? 14 : 0),
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: session.user.id,
        action: "ACCOUNT_CREATED",
        resource: "tenant",
        resourceId: tenant.id,
        metadata: { accountType: input.accountType, resellerType: input.resellerType ?? null, resellerId: input.resellerId ?? null },
      },
    });

    // Invite email, branded for clients of a white-label reseller.
    const brand = tenant.parentId ? await getBrandForTenant(tenant.id) : PLATFORM_BRAND;
    sendInviteEmail({
      to: user.email,
      name: user.name,
      inviterName: `${brand.name} team`,
      tenantName: tenant.name,
      tempPassword,
      loginUrl: `${brand.baseUrl}/login`,
      brand: { name: brand.name, color: brand.primaryColor, replyTo: brand.supportEmail },
    }).catch((err) => console.error("[admin/tenants] invite email failed:", err));

    return NextResponse.json(
      {
        success: true,
        data: {
          tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, accountType: tenant.accountType },
          user: { id: user.id, email: user.email, name: user.name },
          tempPassword,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ProvisioningError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("[admin/tenants POST]", error);
    return NextResponse.json({ success: false, error: "Failed to create the account" }, { status: 500 });
  }
}
