// ROUTE : POST /api/billing/change — upgrade or downgrade an existing paid
// subscription to another plan, swapping the Stripe price with proration.
// Admins only.
//
// Validation:
//  - must have an active Stripe subscription (else use /checkout)
//  - cannot switch to the plan already active
//  - cannot downgrade below current usage (would strand data over the new limit)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { syncStripeSubscription } from "@/lib/billing/subscription";
import { findPurchasablePlan } from "@/lib/billing/plans";
import { getUsage } from "@/lib/billing/usage";
import { isUnlimited, planLimits } from "@/lib/billing/tiers";

const EDIT_ROLES = ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"];
const schema = z.object({ planId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, role } = session.user;
  if (!EDIT_ROLES.includes(role)) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

  try {
    // Visibility-filtered for the same reason as checkout: without it this route
    // is a second way to move onto another customer's private tier.
    const [target, sub] = await Promise.all([
      findPurchasablePlan(tenantId, parsed.data.planId),
      prisma.subscription.findUnique({ where: { tenantId } }),
    ]);
    if (!target) return NextResponse.json({ success: false, error: "Plan not found" }, { status: 404 });

    if (!sub?.stripeSubId || !isStripeConfigured()) {
      return NextResponse.json({ success: false, error: "No active paid subscription to change. Start a checkout instead." }, { status: 400 });
    }
    if (sub.planId === target.id) {
      return NextResponse.json({ success: false, error: "You are already on this plan." }, { status: 400 });
    }
    if (!target.stripePriceId) {
      // A custom tier is invoiced offline and has no Stripe price, so there is no
      // subscription item to swap. Saying "cancel instead" would be wrong advice
      // — cancelling drops them to free rather than onto the agreed plan.
      const message =
        target.visibility === "PRIVATE"
          ? "This is a custom plan — contact your account manager to move onto it."
          : "To move to the Free plan, cancel your subscription instead.";
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }

    // Prevent downgrading below what the tenant is already using.
    const usage = await getUsage(tenantId);
    const limits = planLimits(target);
    const overages: string[] = [];
    if (!isUnlimited(limits.users) && usage.users.used > limits.users) overages.push(`team members (${usage.users.used} > ${limits.users})`);
    if (!isUnlimited(limits.contacts) && usage.contacts.used > limits.contacts) overages.push(`contacts (${usage.contacts.used} > ${limits.contacts})`);
    if (!isUnlimited(limits.storageMb) && usage.storageMb.used > limits.storageMb) overages.push(`storage (${usage.storageMb.used}MB > ${limits.storageMb}MB)`);
    if (overages.length > 0) {
      return NextResponse.json(
        { success: false, error: `Cannot downgrade — you're over the new plan's limits for ${overages.join(", ")}. Reduce usage first.` },
        { status: 400 },
      );
    }

    const stripe = getStripe();
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubId);
    const itemId = stripeSub.items.data[0]?.id;
    if (!itemId) return NextResponse.json({ success: false, error: "Subscription has no billable item." }, { status: 400 });

    const updated = await stripe.subscriptions.update(sub.stripeSubId, {
      items: [{ id: itemId, price: target.stripePriceId }],
      proration_behavior: "create_prorations",
      metadata: { tenantId, planId: target.id },
    });
    await syncStripeSubscription(updated);

    const fresh = await prisma.subscription.findUnique({ where: { tenantId }, include: { plan: true } });
    return NextResponse.json({ success: true, data: fresh });
  } catch (error) {
    console.error("[BILLING CHANGE]", error);
    return NextResponse.json({ success: false, error: "Failed to change plan" }, { status: 500 });
  }
}
