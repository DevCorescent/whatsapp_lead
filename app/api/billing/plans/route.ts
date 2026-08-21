// ROUTE : /api/billing/plans  (GET) — active plans for the plan-selection page,
// plus the tenant's current plan id so the UI can badge it. Any authenticated
// tenant member may read.
//
// "Active plans" means the ones THIS tenant may reach: the public catalogue plus
// its own custom tier, never another customer's. listPlansFor owns that rule —
// see lib/billing/plans.ts for why it is not filtered inline here.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listPlansFor } from "@/lib/billing/plans";
import { isStripeConfigured } from "@/lib/stripe";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  try {
    const { plans, currentPlanId, status } = await listPlansFor(tenantId);

    return NextResponse.json({
      success: true,
      data: {
        plans,
        currentPlanId,
        status,
        billingEnabled: isStripeConfigured(),
      },
    });
  } catch (error) {
    console.error("[BILLING PLANS GET]", error);
    return NextResponse.json({ success: false, error: "Failed to load plans" }, { status: 500 });
  }
}
