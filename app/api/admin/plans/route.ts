// ROUTE : /api/admin/plans
//   GET  — the plan catalogue, optionally narrowed to public or custom tiers.
//   POST — create a plan, optionally cloned from an existing one.
// SUPER_ADMIN only.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { createPlanSchema, resolvePlanScope, updatePlanSchema } from "@/lib/validators/plan";
import { generateCustomPlanName } from "@/lib/billing/plans";
import { recordBillingAudit } from "@/lib/billing/audit";

/** Columns copied when a new plan is cloned from an existing one. */
const CLONEABLE = {
  displayName: true,
  description: true,
  priceMonthly: true,
  priceAnnual: true,
  maxContacts: true,
  maxMsgPerMonth: true,
  maxAgents: true,
  maxCampaigns: true,
  maxFlows: true,
  maxStorageMb: true,
  aiCredits: true,
  maxMsgPerDay: true,
  maxMsgPerHour: true,
  maxBusinesses: true,
  maxKnowledgeDocs: true,
  maxTemplates: true,
  maxQuickReplies: true,
  maxCampaignRecipients: true,
  maxUploadMb: true,
  retentionDays: true,
  allowedAiModels: true,
  allowExport: true,
  aiEnabled: true,
  ragEnabled: true,
  whiteLabel: true,
  advancedAi: true,
  sortOrder: true,
} as const satisfies Prisma.PlanSelect;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const visibility = searchParams.get("visibility");
  const ownerTenantId = searchParams.get("tenantId");

  const where: Prisma.PlanWhereInput = {
    ...(visibility === "PUBLIC" || visibility === "PRIVATE" ? { visibility } : {}),
    // Both the tier built for this tenant and the unowned private tiers an admin
    // could assign to it — that pair is what the tenant page needs to offer, and
    // asking for owned-only would hide every reusable deal.
    ...(ownerTenantId ? { OR: [{ ownerTenantId }, { visibility: "PRIVATE", ownerTenantId: null }] } : {}),
  };

  // Filtered rather than a bare count of the relation. This number is both the
  // "N subscribers" on each card and the input to which plan gets the "Most
  // Popular" badge, and an unfiltered count includes CANCELLED and EXPIRED rows
  // — so a tier everyone has churned off could out-rank one people are actually
  // paying for. PAST_DUE stays in: that is a failed payment, not a departure.
  const plans = await prisma.plan.findMany({
    where,
    orderBy: [{ visibility: "asc" }, { sortOrder: "asc" }],
    include: {
      ownerTenant: { select: { id: true, name: true, slug: true } },
      _count: {
        select: {
          subscriptions: {
            where: { status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
          },
        },
      },
    },
  });

  return NextResponse.json({ success: true, data: plans });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { cloneFrom, ...rest } = (body ?? {}) as { cloneFrom?: unknown } & Record<string, unknown>;

  // Two parse paths, because an omitted field means something different in each.
  //
  //   from scratch — an omitted field takes the create default.
  //   from a clone — an omitted field takes the value on the SOURCE plan, so the
  //                  default-free PATCH schema is used as the overlay. Parsing a
  //                  clone with the create schema would hand back defaults for
  //                  every untouched field and quietly discard the thing being
  //                  cloned, which is the whole point of the request.
  let data: Prisma.PlanUncheckedCreateInput;

  if (typeof cloneFrom === "string" && cloneFrom.length > 0) {
    const source = await prisma.plan.findUnique({ where: { id: cloneFrom }, select: CLONEABLE });
    if (!source) {
      return NextResponse.json({ success: false, error: "Plan to clone from was not found" }, { status: 404 });
    }

    const parsed = updatePlanSchema.safeParse(rest);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
    }
    const scoped = resolvePlanScope(parsed.data);
    if (!scoped.ok) return NextResponse.json({ success: false, error: scoped.error }, { status: 400 });

    data = {
      ...source,
      ...scoped.data,
      // Never inherited from the source. A clone starts as a private, unbadged
      // tier unless the request says otherwise: cloning is how custom plans get
      // made, so the safe default is the one that cannot leak onto the pricing
      // page or steal the ribbon from the plan that earned it.
      name: typeof rest.name === "string" ? rest.name : "",
      visibility: scoped.data.visibility ?? "PRIVATE",
      isPopular: false,
      stripePriceId: scoped.data.stripePriceId ?? null,
      displayName: scoped.data.displayName ?? source.displayName + " (copy)",
    };
  } else {
    const parsed = createPlanSchema.safeParse(rest);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
    }
    const scoped = resolvePlanScope(parsed.data);
    if (!scoped.ok) return NextResponse.json({ success: false, error: scoped.error }, { status: 400 });
    data = { ...scoped.data, name: scoped.data.name ?? "" };
  }

  // The owner has to exist. This is the column that decides whose negotiated
  // price a plan is, so a stale id from a stale dropdown must not be stored.
  let ownerSlug: string | null = null;
  if (data.ownerTenantId) {
    const owner = await prisma.tenant.findUnique({
      where: { id: data.ownerTenantId },
      select: { slug: true },
    });
    if (!owner) return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 });
    ownerSlug = owner.slug;
  }

  if (!data.name) {
    if (data.visibility !== "PRIVATE") {
      return NextResponse.json({ success: false, error: "name is required for a public plan" }, { status: 400 });
    }
    data.name = await generateCustomPlanName(ownerSlug);
  }

  const clash = await prisma.plan.findUnique({ where: { name: data.name }, select: { id: true } });
  if (clash) {
    return NextResponse.json(
      { success: false, error: "A plan named " + data.name + " already exists" },
      { status: 409 },
    );
  }

  // Same at-most-one rule as PATCH: a plan created as popular takes the badge
  // from whichever plan held it, in one transaction so it cannot land on two.
  const plan = await prisma.$transaction(async (tx) => {
    if (data.isPopular) {
      await tx.plan.updateMany({ where: { isPopular: true }, data: { isPopular: false } });
    }
    return tx.plan.create({ data });
  });

  await recordBillingAudit({
    tenantId: plan.ownerTenantId ?? session.user.tenantId,
    userId: session.user.id,
    action: "PLAN_CREATED",
    resource: "plan",
    resourceId: plan.id,
    metadata: {
      name: plan.name,
      displayName: plan.displayName,
      visibility: plan.visibility,
      priceMonthly: plan.priceMonthly,
      clonedFrom: typeof cloneFrom === "string" ? cloneFrom : null,
    },
  });

  return NextResponse.json({ success: true, data: plan }, { status: 201 });
}
