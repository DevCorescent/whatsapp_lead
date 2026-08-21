// ROUTE : /api/admin/plans/[id]  (GET · PATCH · DELETE) — SUPER_ADMIN only.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolvePlanScope, updatePlanSchema } from "@/lib/validators/plan";
import { recordBillingAudit } from "@/lib/billing/audit";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const plan = await prisma.plan.findUnique({
    where: { id },
    include: {
      ownerTenant: { select: { id: true, name: true, slug: true } },
      _count: { select: { subscriptions: true } },
    },
  });
  if (!plan) return NextResponse.json({ success: false, error: "Plan not found" }, { status: 404 });

  return NextResponse.json({ success: true, data: plan });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan) return NextResponse.json({ success: false, error: "Plan not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updatePlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
  }

  const scoped = resolvePlanScope(parsed.data, plan);
  if (!scoped.ok) return NextResponse.json({ success: false, error: scoped.error }, { status: 400 });
  const data = scoped.data;

  if (data.ownerTenantId) {
    const owner = await prisma.tenant.findUnique({
      where: { id: data.ownerTenantId },
      select: { id: true },
    });
    if (!owner) return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 });

    // Handing a plan to one tenant while other tenants are living on it is
    // almost always a misclick on a shared tier. Refused rather than corrected:
    // the two ways out — move the others off, or leave the plan unowned — are
    // decisions about customers, not something this route should pick.
    const strangers = await prisma.subscription.count({
      where: {
        planId: id,
        tenantId: { not: data.ownerTenantId },
        status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] },
      },
    });
    if (strangers > 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Cannot assign this plan to a single tenant — " +
            strangers +
            " other workspace(s) are subscribed to it. Clone it instead.",
        },
        { status: 409 },
      );
    }
  }

  // "Most Popular" is a badge on one card, so promoting a plan demotes whichever
  // held it. Both writes go in one transaction: applied separately, a failure
  // between them leaves the ribbon on two cards or on none.
  const updated = await prisma.$transaction(async (tx) => {
    if (data.isPopular === true) {
      await tx.plan.updateMany({
        where: { id: { not: id }, isPopular: true },
        data: { isPopular: false },
      });
    }
    return tx.plan.update({ where: { id }, data });
  });

  await recordBillingAudit({
    tenantId: updated.ownerTenantId ?? plan.ownerTenantId ?? session.user.tenantId,
    userId: session.user.id,
    action: "PLAN_UPDATED",
    resource: "plan",
    resourceId: id,
    metadata: { name: updated.name, changed: Object.keys(data) },
  });

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const plan = await prisma.plan.findUnique({
    where: { id },
    include: { _count: { select: { subscriptions: true } } },
  });
  if (!plan) return NextResponse.json({ success: false, error: "Plan not found" }, { status: 404 });
  if (plan._count.subscriptions > 0) {
    return NextResponse.json(
      { success: false, error: "Cannot delete — " + plan._count.subscriptions + " active subscription(s)" },
      { status: 409 },
    );
  }

  await prisma.plan.delete({ where: { id } });

  await recordBillingAudit({
    tenantId: plan.ownerTenantId ?? session.user.tenantId,
    userId: session.user.id,
    action: "PLAN_DELETED",
    resource: "plan",
    resourceId: id,
    metadata: { name: plan.name, displayName: plan.displayName, visibility: plan.visibility },
  });

  return NextResponse.json({ success: true });
}
