// ============================================================================
// MODULE : Subscription sync
// ============================================================================
//
// Translates Stripe's view of a subscription into our DB Subscription row. The
// webhook and the checkout/change flows all funnel through `syncStripeSubscription`
// so the DB always reflects Stripe — Stripe is the source of truth for billing
// state, our DB is the synced replica the app reads.

import type Stripe from "stripe";
import type { SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

/** Map Stripe's subscription status onto our SubscriptionStatus enum. */
export function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "canceled":
      return "CANCELLED";
    case "incomplete_expired":
      return "EXPIRED";
    case "incomplete":
    case "paused":
    default:
      return "PAST_DUE";
  }
}

/** Unix-seconds → Date, tolerant of the field living on the item or the sub. */
function toDate(seconds: number | null | undefined, fallback: Date): Date {
  return typeof seconds === "number" ? new Date(seconds * 1000) : fallback;
}

/**
 * Extract the current period window. Across Stripe API versions this lives either
 * on the subscription or on its first item, so read both defensively.
 */
function periodWindow(sub: Stripe.Subscription): { start: Date; end: Date } {
  const item = sub.items?.data?.[0] as unknown as {
    current_period_start?: number;
    current_period_end?: number;
  } | undefined;
  const subLevel = sub as unknown as { current_period_start?: number; current_period_end?: number };
  const now = new Date();
  const monthLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    start: toDate(item?.current_period_start ?? subLevel.current_period_start, now),
    end: toDate(item?.current_period_end ?? subLevel.current_period_end, monthLater),
  };
}

/** The tenant a Stripe subscription belongs to (metadata first, then our row). */
async function resolveTenantId(sub: Stripe.Subscription): Promise<string | null> {
  const fromMeta = sub.metadata?.tenantId;
  if (fromMeta) return fromMeta;

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const existing = await prisma.subscription.findFirst({
    where: { OR: [{ stripeSubId: sub.id }, { stripeCustomerId: customerId }] },
    select: { tenantId: true },
  });
  return existing?.tenantId ?? null;
}

/**
 * Create or update the DB Subscription row from a Stripe subscription object.
 * Returns the tenantId synced, or null when the subscription can't be matched to
 * a tenant (in which case the webhook simply acknowledges and moves on).
 */
export async function syncStripeSubscription(sub: Stripe.Subscription): Promise<string | null> {
  const tenantId = await resolveTenantId(sub);
  if (!tenantId) {
    console.warn(`[BILLING SYNC] No tenant for Stripe subscription ${sub.id}`);
    return null;
  }

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const priceId = sub.items?.data?.[0]?.price?.id;
  const { start, end } = periodWindow(sub);
  const status = mapStripeStatus(sub.status);

  // Resolve the plan from the Stripe price id; fall back to the existing plan.
  const existing = await prisma.subscription.findUnique({ where: { tenantId }, select: { planId: true } });
  const plan = priceId
    ? await prisma.plan.findFirst({ where: { stripePriceId: priceId }, select: { id: true } })
    : null;
  const planId = plan?.id ?? existing?.planId;
  if (!planId) {
    console.warn(`[BILLING SYNC] No plan resolved for price ${priceId} (sub ${sub.id})`);
    return null;
  }

  const common = {
    planId,
    status,
    currentPeriodStart: start,
    currentPeriodEnd: end,
    trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    cancelledAt: sub.status === "canceled" ? new Date() : null,
    stripeSubId: sub.id,
    stripeCustomerId: customerId,
  };

  await prisma.subscription.upsert({
    where: { tenantId },
    create: { tenantId, ...common },
    update: common,
  });

  return tenantId;
}

/** Reset the AI-credit counter for a tenant's new billing period. */
export async function resetAiUsage(tenantId: string): Promise<void> {
  await prisma.subscription.updateMany({ where: { tenantId }, data: { aiCreditsUsed: 0 } });
}

/**
 * Ensure a Stripe customer exists for the tenant, reusing the one on the existing
 * subscription row when present. Returns the Stripe customer id.
 */
export async function getOrCreateStripeCustomer(tenantId: string): Promise<string> {
  const stripe = getStripe();
  const existing = await prisma.subscription.findUnique({
    where: { tenantId },
    select: { stripeCustomerId: true },
  });
  if (existing?.stripeCustomerId) return existing.stripeCustomerId;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, users: { where: { role: "TENANT_OWNER" }, select: { email: true }, take: 1 } },
  });

  const customer = await stripe.customers.create({
    name: tenant?.name ?? undefined,
    email: tenant?.users?.[0]?.email ?? undefined,
    metadata: { tenantId },
  });
  return customer.id;
}
