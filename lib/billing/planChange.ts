// ============================================================================
// MODULE : Applying a priced plan change
// ============================================================================
//
// The half of the upgrade/downgrade flow that touches the database. The pricing
// itself is in lib/billing/proration.ts and is pure; this file is what turns a
// quote into a PlanChange row, and a paid PlanChange row into a moved subscription.
//
// The route and the Stripe webhook both need the second half, which is why it is
// here and not inline in either. They are also the two places where it must happen
// exactly once: Stripe retries, and a customer refreshing the success page can
// arrive before the webhook does.

import type { Plan, Subscription } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Cycle } from "@/lib/billing/period";
import {
  classifyChange,
  quoteDowngrade,
  quoteUpgrade,
  type DowngradeQuote,
  type UpgradeQuote,
} from "@/lib/billing/proration";

/** Currency for proration charges. Matches the rupee prices stored on Plan. */
export const PLAN_CURRENCY = "inr";

export type Quote = UpgradeQuote | DowngradeQuote;

/** Why a plan change cannot be quoted. Each maps to a specific message and status. */
export type QuoteRefusal =
  | { reason: "same-plan" }
  | { reason: "expired" }
  | { reason: "target-free" }
  | { reason: "not-active" }
  | { reason: "no-subscription" };

export type QuoteResult =
  | { ok: true; kind: "UPGRADE" | "DOWNGRADE"; quote: Quote }
  | { ok: false; refusal: QuoteRefusal };

/**
 * Price a move from the tenant's current plan onto `targetPlan`.
 *
 * Direction is decided here, from the two prices in the database — never from the
 * request. A client that could declare "this is a downgrade" could otherwise have a
 * ₹9,999 plan applied for free.
 */
export function quoteChange(opts: {
  subscription: Pick<
    Subscription,
    "planId" | "billingCycle" | "currentPeriodStart" | "currentPeriodEnd" | "status"
  >;
  currentPlan: Pick<Plan, "priceMonthly" | "priceAnnual">;
  targetPlan: Pick<Plan, "id" | "priceMonthly" | "priceAnnual">;
  now: Date;
}): QuoteResult {
  const { subscription: sub, currentPlan, targetPlan, now } = opts;
  const cycle = sub.billingCycle as Cycle;

  if (sub.planId === targetPlan.id) return { ok: false, refusal: { reason: "same-plan" } };

  // Proration credits the UNPAID-FOR remainder of something the customer bought.
  // A subscription that is not ACTIVE was never paid for in this period — a trial,
  // a past-due account, a cancelled one — so it has no value to carry across.
  //
  // Without this, a TRIALING workspace on the ₹2,999 tier could "downgrade" to the
  // ₹999 tier on day one and have its untouched trial valued at ₹2,999, converting
  // into ninety free days of a paid plan without a rupee ever changing hands. The
  // screen already only offers this to ACTIVE subscribers; this is the same rule on
  // the server, where it actually binds.
  if (sub.status !== "ACTIVE") return { ok: false, refusal: { reason: "not-active" } };

  // An expired or never-started window has no unused value to carry, so there is
  // nothing to prorate against — that is a fresh purchase, not a change.
  if (sub.currentPeriodEnd <= now) return { ok: false, refusal: { reason: "expired" } };

  const kind = classifyChange(currentPlan, targetPlan, cycle);
  if (kind === "SAME") {
    // Same price, different plan. Treated as an upgrade so the swap still happens
    // and still goes through the same record; the quote will simply be zero.
    return {
      ok: true,
      kind: "UPGRADE",
      quote: quoteUpgrade({
        currentPlan,
        targetPlan,
        cycle,
        periodStart: sub.currentPeriodStart,
        periodEnd: sub.currentPeriodEnd,
        now,
      }),
    };
  }

  if (kind === "UPGRADE") {
    return {
      ok: true,
      kind,
      quote: quoteUpgrade({
        currentPlan,
        targetPlan,
        cycle,
        periodStart: sub.currentPeriodStart,
        periodEnd: sub.currentPeriodEnd,
        now,
      }),
    };
  }

  // Downgrade. A free target has no daily rate to convert the credit into, so it is
  // refused here and the customer is pointed at cancellation, which lets the period
  // they already paid for run to its end.
  if (targetPlan.priceMonthly <= 0 && targetPlan.priceAnnual <= 0) {
    return { ok: false, refusal: { reason: "target-free" } };
  }

  return {
    ok: true,
    kind,
    quote: quoteDowngrade({
      currentPlan,
      targetPlan,
      cycle,
      periodStart: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
      now,
    }),
  };
}

/** Outcome of applying a change. `alreadyApplied` is a success, not a failure. */
export type ApplyResult =
  | { ok: true; alreadyApplied: boolean }
  | { ok: false; reason: "not-found" | "not-payable" | "stale" };

/**
 * Move the subscription onto the plan a PlanChange names, exactly once.
 *
 * Idempotent by construction: the status transition is part of the same transaction
 * as the subscription write, and only a row still in PENDING or PAID is eligible. A
 * redelivered webhook, a refreshed success page and a double-click all converge on
 * the same single application.
 *
 * Staleness is checked too. A PENDING quote priced against plan A is void if the
 * subscription has since moved to plan B — applying it would grant a plan the
 * customer was never quoted, at a price computed from a period that no longer
 * exists.
 *
 * @param planChangeId - The row to apply.
 * @param paymentRef - Stripe's payment reference, stored for reconciliation. Never a
 *   secret; it is an identifier, not a credential.
 */
export async function applyPlanChange(
  planChangeId: string,
  paymentRef?: string | null,
): Promise<ApplyResult> {
  return prisma.$transaction(async (tx) => {
    const change = await tx.planChange.findUnique({ where: { id: planChangeId } });
    if (!change) return { ok: false as const, reason: "not-found" as const };

    // Already done. Reported as success so a retrying webhook stops retrying.
    if (change.status === "APPLIED") return { ok: true as const, alreadyApplied: true };

    if (change.status === "FAILED" || change.status === "CANCELLED") {
      return { ok: false as const, reason: "not-payable" as const };
    }

    const sub = await tx.subscription.findUnique({ where: { tenantId: change.tenantId } });
    if (!sub) return { ok: false as const, reason: "not-found" as const };

    // The quote was priced against this plan. If the workspace has moved since,
    // the numbers behind this row no longer describe reality.
    if (sub.planId !== change.fromPlanId) {
      await tx.planChange.update({
        where: { id: change.id },
        data: { status: "CANCELLED" },
      });
      return { ok: false as const, reason: "stale" as const };
    }

    await tx.subscription.update({
      where: { tenantId: change.tenantId },
      data: {
        planId: change.toPlanId,
        status: "ACTIVE",
        currentPeriodStart: change.resultPeriodStart,
        currentPeriodEnd: change.resultPeriodEnd,
        cancelAtPeriodEnd: false,
        cancelledAt: null,
        // A plan set through this flow is a real, paid-for position rather than an
        // offline arrangement, so Stripe subscription sync is left free to run.
        planLockedAt: null,
      },
    });

    await tx.planChange.update({
      where: { id: change.id },
      data: {
        status: "APPLIED",
        appliedAt: new Date(),
        ...(paymentRef ? { stripePaymentRef: paymentRef } : {}),
      },
    });

    return { ok: true as const, alreadyApplied: false };
  });
}

/**
 * Record that a Stripe event has been handled, returning false if it already had.
 *
 * The insert itself is the lock — a unique-violation on Stripe's own event id means
 * another delivery of the same event got there first.
 */
export async function claimStripeEvent(eventId: string, type: string): Promise<boolean> {
  try {
    await prisma.processedStripeEvent.create({ data: { id: eventId, type } });
    return true;
  } catch {
    return false;
  }
}
