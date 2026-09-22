// ============================================================================
// ROUTE : /api/billing/change
// GET   - Quote a move to another plan. Read-only; nothing is charged or changed.
// POST  - Execute it. An upgrade is charged the prorated difference before it
//         takes effect; a downgrade applies immediately and carries the unused
//         value of the current plan forward as extra days.
//
// ACCESS - Admins of the owning tenant (SUPER_ADMIN / TENANT_OWNER / ADMIN).
//
// The one rule this route exists to enforce: the browser never says what a change
// costs, and never says that it was paid for. It sends a planId. Everything else —
// direction, price, resulting period — is computed here from the plans and the
// subscription in the database, written to a PlanChange row, and only acted upon
// when Stripe confirms the payment against that row.
//
// An upgrade is therefore NOT applied by this route. It returns a Checkout URL and
// stops; /api/webhook/stripe applies it after verifying the session. A customer who
// closes the payment page keeps the plan they had.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured, appBaseUrl } from "@/lib/stripe";
import { getOrCreateStripeCustomer } from "@/lib/billing/subscription";
import { findPurchasablePlan } from "@/lib/billing/plans";
import { getUsage } from "@/lib/billing/usage";
import { isUnlimited, planLimits } from "@/lib/billing/tiers";
import { toMajor } from "@/lib/billing/proration";
import { applyPlanChange, quoteChange, PLAN_CURRENCY } from "@/lib/billing/planChange";

const EDIT_ROLES = ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"];
const schema = z.object({ planId: z.string().min(1) });

/** Operator-facing text for each reason a change cannot be quoted. */
const REFUSAL_MESSAGE: Record<string, { message: string; status: number }> = {
  "same-plan": { message: "You are already on this plan.", status: 400 },
  expired: {
    message:
      "Your billing period has ended, so there is nothing left to carry over. Start a new subscription instead.",
    status: 400,
  },
  "target-free": {
    message: "To move to the Free plan, cancel your subscription instead — your current plan runs to the end of the period you have paid for.",
    status: 400,
  },
  "not-active": {
    message:
      "Your subscription isn't active, so there's no paid time to carry over. Choose a plan and start a subscription instead.",
    status: 400,
  },
  "no-subscription": { message: "No active subscription to change.", status: 400 },
};

/**
 * Everything both verbs need: the subscription, the plan it is on, and the target.
 * Returns a NextResponse instead when the request cannot proceed.
 */
async function loadContext(tenantId: string, targetPlanId: string) {
  // Visibility-filtered: a planId is not a secret, and a bare id lookup would let
  // any tenant move onto another customer's negotiated private tier.
  const [targetPlan, sub] = await Promise.all([
    findPurchasablePlan(tenantId, targetPlanId),
    prisma.subscription.findUnique({ where: { tenantId }, include: { plan: true } }),
  ]);

  if (!targetPlan) {
    return { error: NextResponse.json({ success: false, error: "Plan not found" }, { status: 404 }) };
  }
  if (!targetPlan.isActive) {
    return {
      error: NextResponse.json(
        { success: false, error: "That plan is no longer available." },
        { status: 400 },
      ),
    };
  }
  if (!sub) {
    return {
      error: NextResponse.json(
        { success: false, error: REFUSAL_MESSAGE["no-subscription"].message },
        { status: 400 },
      ),
    };
  }
  return { targetPlan, sub };
}

/**
 * Refuse a downgrade that would strand data above the new plan's limits.
 *
 * Kept from the original route: dropping a tenant under its own usage leaves
 * contacts and team members it can see but not manage.
 */
async function overageError(tenantId: string, targetPlan: Parameters<typeof planLimits>[0]) {
  const usage = await getUsage(tenantId);
  const limits = planLimits(targetPlan);
  const overages: string[] = [];
  if (!isUnlimited(limits.users) && usage.users.used > limits.users)
    overages.push(`team members (${usage.users.used} > ${limits.users})`);
  if (!isUnlimited(limits.contacts) && usage.contacts.used > limits.contacts)
    overages.push(`contacts (${usage.contacts.used} > ${limits.contacts})`);
  if (!isUnlimited(limits.storageMb) && usage.storageMb.used > limits.storageMb)
    overages.push(`storage (${usage.storageMb.used}MB > ${limits.storageMb}MB)`);
  return overages.length > 0
    ? `Cannot downgrade — you're over the new plan's limits for ${overages.join(", ")}. Reduce usage first.`
    : null;
}

// ─── GET: quote ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, role } = session.user;
  if (!EDIT_ROLES.includes(role))
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const planId = new URL(req.url).searchParams.get("planId");
  if (!planId)
    return NextResponse.json({ success: false, error: "planId is required" }, { status: 400 });

  const ctx = await loadContext(tenantId, planId);
  if ("error" in ctx) return ctx.error;
  const { targetPlan, sub } = ctx;

  const result = quoteChange({
    subscription: sub,
    currentPlan: sub.plan,
    targetPlan,
    now: new Date(),
  });

  if (!result.ok) {
    const { message, status } = REFUSAL_MESSAGE[result.refusal.reason];
    return NextResponse.json({ success: false, error: message }, { status });
  }

  const overage = result.kind === "DOWNGRADE" ? await overageError(tenantId, targetPlan) : null;
  if (overage) return NextResponse.json({ success: false, error: overage }, { status: 400 });

  // Amounts are sent in both minor units and rupees. The UI renders the rupee
  // figure and never computes it — a price multiplied in the browser is a price
  // that can disagree with the one actually charged.
  return NextResponse.json({
    success: true,
    data: {
      kind: result.kind,
      currentPlan: { id: sub.plan.id, displayName: sub.plan.displayName },
      targetPlan: { id: targetPlan.id, displayName: targetPlan.displayName },
      amountDueMinor: result.quote.amountDueMinor,
      amountDue: toMajor(result.quote.amountDueMinor),
      creditMinor: result.quote.creditMinor,
      credit: toMajor(result.quote.creditMinor),
      currency: PLAN_CURRENCY,
      effectiveAt: new Date().toISOString(),
      periodStart:
        result.quote.kind === "DOWNGRADE"
          ? result.quote.periodStart.toISOString()
          : sub.currentPeriodStart.toISOString(),
      periodEnd: result.quote.periodEnd.toISOString(),
      grantedDays: result.quote.kind === "DOWNGRADE" ? result.quote.grantedDays : null,
      requiresPayment: result.quote.amountDueMinor > 0,
    },
  });
}

// ─── POST: execute ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, role } = session.user;
  if (!EDIT_ROLES.includes(role))
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

  try {
    const ctx = await loadContext(tenantId, parsed.data.planId);
    if ("error" in ctx) return ctx.error;
    const { targetPlan, sub } = ctx;

    const now = new Date();
    const result = quoteChange({ subscription: sub, currentPlan: sub.plan, targetPlan, now });
    if (!result.ok) {
      const { message, status } = REFUSAL_MESSAGE[result.refusal.reason];
      return NextResponse.json({ success: false, error: message }, { status });
    }

    if (result.kind === "DOWNGRADE") {
      const overage = await overageError(tenantId, targetPlan);
      if (overage) return NextResponse.json({ success: false, error: overage }, { status: 400 });
    }

    const quote = result.quote;
    const resultPeriodStart =
      quote.kind === "DOWNGRADE" ? quote.periodStart : sub.currentPeriodStart;

    // Supersede any earlier pending quote for this tenant. Leaving them open would
    // let a customer pay a stale, cheaper quote after prices or plans moved on.
    //
    // The Stripe session is expired too, not just the row. Cancelling our record
    // alone would leave a payable checkout page in the customer's other tab: paying
    // it takes their money and then finds a CANCELLED row that applyPlanChange
    // rightly refuses, so they are charged and not upgraded. Expiring it at Stripe
    // is what makes the supersede complete on both sides.
    const superseded = await prisma.planChange.findMany({
      where: { tenantId, status: "PENDING" },
      select: { id: true, stripeSessionId: true },
    });
    if (superseded.length > 0) {
      if (isStripeConfigured()) {
        const stripeForExpiry = getStripe();
        await Promise.all(
          superseded
            .filter((row) => row.stripeSessionId)
            .map(async (row) => {
              try {
                await stripeForExpiry.checkout.sessions.expire(row.stripeSessionId!);
              } catch (error) {
                // Already expired, already paid, or unreachable. Not fatal: the row
                // is cancelled either way, and a session that was already paid is
                // handled by the webhook against its own row.
                console.warn("[BILLING CHANGE] Could not expire superseded session", {
                  planChangeId: row.id,
                  reason: error instanceof Error ? error.message : "unknown error",
                });
              }
            }),
        );
      }
      await prisma.planChange.updateMany({
        where: { id: { in: superseded.map((row) => row.id) } },
        data: { status: "CANCELLED" },
      });
    }

    const change = await prisma.planChange.create({
      data: {
        tenantId,
        fromPlanId: sub.planId,
        toPlanId: targetPlan.id,
        kind: result.kind,
        amountDueMinor: quote.amountDueMinor,
        currency: PLAN_CURRENCY,
        resultPeriodStart,
        resultPeriodEnd: quote.periodEnd,
      },
    });

    // Nothing to pay — a downgrade, or an upgrade priced at zero because the period
    // is all but over. Applied here, in the same transaction-guarded path a paid
    // change takes, so both routes converge on one implementation.
    if (quote.amountDueMinor <= 0) {
      const applied = await applyPlanChange(change.id);
      if (!applied.ok) {
        return NextResponse.json(
          { success: false, error: "Your subscription changed while this was being prepared. Please try again." },
          { status: 409 },
        );
      }
      const fresh = await prisma.subscription.findUnique({
        where: { tenantId },
        include: { plan: true },
      });
      return NextResponse.json({
        success: true,
        data: {
          url: null,
          applied: true,
          kind: result.kind,
          grantedDays: quote.kind === "DOWNGRADE" ? quote.grantedDays : null,
          periodEnd: quote.periodEnd.toISOString(),
          subscription: fresh,
        },
      });
    }

    // Paid upgrade. From here the plan does not move until Stripe confirms.
    if (!isStripeConfigured()) {
      await prisma.planChange.update({ where: { id: change.id }, data: { status: "FAILED" } });
      return NextResponse.json(
        { success: false, error: "Payments are not configured on this deployment." },
        { status: 400 },
      );
    }

    const stripe = getStripe();
    const customerId = await getOrCreateStripeCustomer(tenantId);

    // A one-off charge built from `price_data` rather than a stored Stripe price:
    // the amount is a proration computed for this customer at this moment, so no
    // catalogue price could express it. The figure comes from the PlanChange row,
    // which is the same row the webhook re-reads before applying anything.
    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: PLAN_CURRENCY,
            unit_amount: change.amountDueMinor,
            product_data: {
              name: `Upgrade to ${targetPlan.displayName}`,
              description: `Prorated for the remainder of your billing period, ending ${quote.periodEnd.toDateString()}.`,
            },
          },
        },
      ],
      success_url: `${appBaseUrl()}/billing?change=success`,
      cancel_url: `${appBaseUrl()}/billing/plans?change=cancelled`,
      // Read back by the webhook to find this row. Not trusted for the amount —
      // that is re-read from the database.
      metadata: { tenantId, planChangeId: change.id },
      payment_intent_data: { metadata: { tenantId, planChangeId: change.id } },
    });

    await prisma.planChange.update({
      where: { id: change.id },
      data: { stripeSessionId: checkout.id },
    });

    return NextResponse.json({
      success: true,
      data: {
        url: checkout.url,
        applied: false,
        kind: result.kind,
        amountDue: toMajor(change.amountDueMinor),
        planChangeId: change.id,
      },
    });
  } catch (error) {
    // Never the error object: a rejected Stripe call can carry request context.
    console.error("[BILLING CHANGE]", {
      tenantId,
      reason: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json({ success: false, error: "Failed to change plan" }, { status: 500 });
  }
}
