// ============================================================================
// ROUTE : /api/reseller/plans
//
// GET  - The reseller's own plans, plus the platform plans it can build on.
// POST - Create a plan for its clients from a platform base plan (limits copied,
//        price never below the base). See lib/reseller.ts.
//
// Reseller accounts only; reseller.plans.manage.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAccountScope, requireReseller } from "@/lib/accounts";
import { requirePermission } from "@/lib/permissions";
import { BASE_PLAN_WHERE, createResellerPlan, ResellerPlanError } from "@/lib/reseller";

const PLAN_SELECT = {
  id: true, displayName: true, description: true, priceMonthly: true, priceAnnual: true, isActive: true,
  basePlanId: true, maxContacts: true, maxMsgPerMonth: true, maxAgents: true, maxCampaigns: true,
  createdAt: true, _count: { select: { subscriptions: true } },
} as const;

const createSchema = z.object({
  displayName: z.string().trim().min(1, "Name is required").max(60),
  description: z.string().trim().max(300).optional(),
  basePlanId: z.string().min(1, "Choose a base plan"),
  priceMonthly: z.number().nonnegative().max(10_000_000),
  priceAnnual: z.number().nonnegative().max(100_000_000).optional(),
});

export async function GET() {
  const scope = await getAccountScope();
  const notReseller = requireReseller(scope);
  if (notReseller) return notReseller;
  const denied = await requirePermission(scope, "reseller.plans.manage");
  if (denied) return denied;

  const [plans, basePlans] = await Promise.all([
    prisma.plan.findMany({ where: { resellerId: scope!.tenantId }, select: PLAN_SELECT, orderBy: { priceMonthly: "asc" } }),
    prisma.plan.findMany({
      where: BASE_PLAN_WHERE,
      select: { id: true, displayName: true, priceMonthly: true, priceAnnual: true, maxContacts: true, maxMsgPerMonth: true, maxAgents: true },
      orderBy: [{ sortOrder: "asc" }, { priceMonthly: "asc" }],
    }),
  ]);
  return NextResponse.json({
    success: true,
    data: {
      plans: plans.map(({ _count, ...p }) => ({ ...p, clients: _count.subscriptions })),
      basePlans,
    },
  });
}

export async function POST(req: NextRequest) {
  const scope = await getAccountScope();
  const notReseller = requireReseller(scope);
  if (notReseller) return notReseller;
  const denied = await requirePermission(scope, "reseller.plans.manage");
  if (denied) return denied;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

  try {
    const plan = await createResellerPlan(scope!.tenantId, parsed.data);
    return NextResponse.json({ success: true, data: { id: plan.id } }, { status: 201 });
  } catch (error) {
    if (error instanceof ResellerPlanError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("[RESELLER PLANS POST]", error);
    return NextResponse.json({ success: false, error: "Failed to create the plan" }, { status: 500 });
  }
}
