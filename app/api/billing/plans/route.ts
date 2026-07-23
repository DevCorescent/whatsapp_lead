// ROUTE : /api/billing/plans  (GET) — active plans for the plan-selection page,
// plus the tenant's current plan id so the UI can badge it. Any authenticated
// tenant member may read.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isStripeConfigured } from "@/lib/stripe";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  try {
    const [plans, subscription] = await Promise.all([
      prisma.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
      prisma.subscription.findUnique({ where: { tenantId }, select: { planId: true, status: true } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        plans,
        currentPlanId: subscription?.planId ?? null,
        status: subscription?.status ?? null,
        billingEnabled: isStripeConfigured(),
      },
    });
  } catch (error) {
    console.error("[BILLING PLANS GET]", error);
    return NextResponse.json({ success: false, error: "Failed to load plans" }, { status: 500 });
  }
}
