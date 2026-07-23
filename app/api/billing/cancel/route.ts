// ROUTE : POST /api/billing/cancel — schedule the subscription to end at the
// current period end (Stripe cancel_at_period_end). Admins only. Refuses if the
// subscription is already cancelled or already scheduled to cancel.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { syncStripeSubscription } from "@/lib/billing/subscription";

const EDIT_ROLES = ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"];

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, role } = session.user;
  if (!EDIT_ROLES.includes(role)) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  try {
    const sub = await prisma.subscription.findUnique({ where: { tenantId } });
    if (!sub) return NextResponse.json({ success: false, error: "No active subscription." }, { status: 400 });
    if (sub.status === "CANCELLED") {
      return NextResponse.json({ success: false, error: "Subscription is already cancelled." }, { status: 400 });
    }
    if (sub.cancelAtPeriodEnd) {
      return NextResponse.json({ success: false, error: "Subscription is already set to cancel at period end." }, { status: 400 });
    }

    if (sub.stripeSubId && isStripeConfigured()) {
      const updated = await getStripe().subscriptions.update(sub.stripeSubId, { cancel_at_period_end: true });
      await syncStripeSubscription(updated);
    } else {
      // Free/unmanaged subscription — mark locally.
      await prisma.subscription.update({ where: { tenantId }, data: { cancelAtPeriodEnd: true } });
    }

    const fresh = await prisma.subscription.findUnique({ where: { tenantId } });
    return NextResponse.json({ success: true, data: fresh });
  } catch (error) {
    console.error("[BILLING CANCEL]", error);
    return NextResponse.json({ success: false, error: "Failed to cancel subscription" }, { status: 500 });
  }
}
