// ROUTE : POST /api/billing/checkout — start a subscription for a plan.
//  - Free plan (price 0 / no Stripe price): assigned directly, no payment.
//  - Paid plan: creates a Stripe Checkout Session and returns its URL.
// Admins only. Prevents purchasing the plan the tenant is already on.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured, appBaseUrl } from "@/lib/stripe";
import { getOrCreateStripeCustomer } from "@/lib/billing/subscription";

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
    const plan = await prisma.plan.findFirst({ where: { id: parsed.data.planId, isActive: true } });
    if (!plan) return NextResponse.json({ success: false, error: "Plan not found" }, { status: 404 });

    const current = await prisma.subscription.findUnique({ where: { tenantId } });

    // Prevent purchasing the same active plan again (duplicate subscription).
    if (current && current.planId === plan.id && current.status === "ACTIVE") {
      return NextResponse.json({ success: false, error: "You are already on this plan." }, { status: 400 });
    }

    // Free plan — assign directly, no Stripe involved.
    if (plan.priceMonthly <= 0 || !plan.stripePriceId) {
      const now = new Date();
      const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const data = {
        planId: plan.id,
        status: "ACTIVE" as const,
        currentPeriodStart: now,
        currentPeriodEnd: end,
        cancelAtPeriodEnd: false,
        cancelledAt: null,
      };
      await prisma.subscription.upsert({
        where: { tenantId },
        create: { tenantId, ...data },
        update: data,
      });
      return NextResponse.json({ success: true, data: { url: null, assigned: true } });
    }

    if (!isStripeConfigured()) {
      return NextResponse.json({ success: false, error: "Billing is not configured." }, { status: 400 });
    }

    const stripe = getStripe();
    const customerId = await getOrCreateStripeCustomer(tenantId);

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      success_url: `${appBaseUrl()}/billing?checkout=success`,
      cancel_url: `${appBaseUrl()}/billing/plans?checkout=cancelled`,
      metadata: { tenantId, planId: plan.id },
      subscription_data: { metadata: { tenantId, planId: plan.id } },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ success: true, data: { url: checkout.url } });
  } catch (error) {
    console.error("[BILLING CHECKOUT]", error);
    return NextResponse.json({ success: false, error: "Failed to start checkout" }, { status: 500 });
  }
}
