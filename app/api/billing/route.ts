// ============================================================================
// ROUTE : /api/billing  (GET)
//
// The tenant's billing summary: current plan, subscription status, renewal,
// and live usage metrics. Any authenticated tenant member may read it.
// ============================================================================

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUsage, resolveTenantPlan } from "@/lib/billing/usage";
import { isRazorpayConfigured } from "@/lib/razorpay";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  try {
    const [{ subscription, planName }, usage] = await Promise.all([
      resolveTenantPlan(tenantId),
      getUsage(tenantId),
    ]);

    return NextResponse.json({
      planId: subscription?.planId ?? null,
      planName,
      priceMonthly: subscription?.plan.priceMonthly ?? 0,
      status: subscription?.status ?? "TRIALING",
      renewsAt: subscription?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      trialEndsAt: subscription?.trialEndsAt?.toISOString() ?? null,
      hasStripe: false,
      hasRazorpay: isRazorpayConfigured(),
      invoices: [],
      usage: {
        contacts: { label: "Contacts", ...usage.contacts },
        messages: { label: "Messages this month", ...usage.messages },
        agents: { label: "Agents", ...usage.users },
        campaigns: { label: "Campaigns this period", ...usage.campaigns },
        storage: { label: "Storage (MB)", ...usage.storageMb },
        ai: { label: "AI credits", ...usage.aiCredits },
      },
    });
  } catch (error) {
    console.error("[BILLING GET]", error);
    return NextResponse.json({ error: "Failed to load billing" }, { status: 500 });
  }
}
