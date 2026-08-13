// ============================================================================
// MODULE : Usage metering & limit enforcement
// ============================================================================
//
// The single source of truth for "how much has this tenant used" and "is this
// tenant allowed to create one more". Both the billing UI (usage cards) and the
// creation endpoints (contacts/team/campaigns/AI) call in here, so the number
// shown to the user and the number enforced can never drift apart.
//
// Most usage is COUNTED LIVE (users, contacts, campaigns this period, messages,
// storage) so it is always accurate; AI credits are the one persisted counter,
// reset each billing period by the Stripe webhook.

import { MessageDirection } from "@prisma/client";
import type { Plan, Subscription } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  FREE_TIER_GRANTS,
  FREE_TIER_LIMITS,
  FREE_TIER_NAME,
  isUnlimited,
  planGrants,
  planLimits,
  type PlanGrants,
  type PlanLimits,
} from "@/lib/billing/tiers";
import {
  FEATURE_LABEL,
  FeatureError,
  LimitError,
  RESOURCE_LABEL,
  type LimitResource,
  type PlanFeature,
} from "@/lib/billing/limits";

// The errors and the resource names are declared in lib/billing/limits.ts, which
// the upgrade dialog also imports — a component cannot pull in this file without
// dragging Prisma into the browser bundle. Re-exported so server callers can keep
// importing everything about limits from one place.
export { LimitError, FeatureError };
export type { LimitResource, PlanFeature };

export interface ResolvedPlan {
  subscription: (Subscription & { plan: Plan }) | null;
  planName: string;
  limits: PlanLimits;
  grants: PlanGrants;
}

/** Resolve a tenant's effective plan + limits + grants, falling back to the free tier. */
export async function resolveTenantPlan(tenantId: string): Promise<ResolvedPlan> {
  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
    include: { plan: true },
  });
  if (!subscription) {
    return {
      subscription: null,
      planName: FREE_TIER_NAME,
      limits: FREE_TIER_LIMITS,
      grants: FREE_TIER_GRANTS,
    };
  }
  return {
    subscription,
    planName: subscription.plan.displayName || subscription.plan.name,
    limits: planLimits(subscription.plan),
    grants: planGrants(subscription.plan),
  };
}

/**
 * Does this tenant's plan include `feature`?
 *
 * The quiet counterpart to `assertFeature`. Background work — the auto-reply
 * worker, knowledge retrieval during a reply — has no user waiting on a dialog
 * and no request to fail, so it asks rather than throws and simply does less.
 *
 * Fails closed on error: an unreachable database must not read as "everything
 * is included", which is the direction that gives the product away.
 */
export async function planAllows(tenantId: string, feature: PlanFeature): Promise<boolean> {
  try {
    const { grants } = await resolveTenantPlan(tenantId);
    return grants[feature];
  } catch (error) {
    console.error(`[BILLING] Could not resolve plan for ${tenantId}; denying ${feature}:`, error);
    return false;
  }
}

/**
 * Boolean counterpart to `assertWithinLimit`, for background work that has no
 * request to fail and no dialog to show. Fails closed, for the same reason
 * `planAllows` does.
 */
export async function hasCapacity(
  tenantId: string,
  resource: LimitResource,
  increment = 1,
): Promise<boolean> {
  try {
    await assertWithinLimit(tenantId, resource, increment);
    return true;
  } catch (error) {
    if (error instanceof LimitError) return false;
    console.error(`[BILLING] Could not check ${resource} for ${tenantId}; denying:`, error);
    return false;
  }
}

/**
 * Assert the tenant's plan includes `feature`. Throws FeatureError (→ HTTP 403
 * with PLAN_FEATURE) so an interactive request gets the upgrade dialog rather
 * than silently doing nothing.
 */
export async function assertFeature(tenantId: string, feature: PlanFeature): Promise<void> {
  const { grants, planName } = await resolveTenantPlan(tenantId);
  if (grants[feature]) return;

  throw new FeatureError(
    feature,
    planName,
    `${FEATURE_LABEL[feature]} is not included in the ${planName} plan. Upgrade to use it.`,
  );
}

/**
 * Assert a single request stays under a per-request ceiling.
 *
 * Distinct from `assertWithinLimit`, which counts what already exists. These
 * limits bound one campaign's audience or one file's size, so there is nothing to
 * count — the request itself is the whole quantity being judged.
 */
export function assertBelowCeiling(
  resource: LimitResource,
  value: number,
  limit: number,
  planName: string,
): void {
  if (isUnlimited(limit)) return;
  if (value <= limit) return;

  throw new LimitError(
    { resource, used: value, limit, planName },
    `Your plan allows ${limit} ${RESOURCE_LABEL[resource]}; this request needs ${value}. Upgrade for more.`,
  );
}

/** Is `model` one this plan may select? An empty allow-list permits anything. */
export function modelAllowed(grants: PlanGrants, model: string | null | undefined): boolean {
  if (!grants.allowedAiModels.length) return true;
  if (!model) return true;
  return grants.allowedAiModels.includes(model);
}

/** The start of the current billing period (subscription anchor, else month start). */
function periodStart(subscription: (Subscription & { plan: Plan }) | null): Date {
  if (subscription?.currentPeriodStart) return subscription.currentPeriodStart;
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Start of the rolling window `hours` back from now, for the throughput caps. */
function windowStart(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

/**
 * Outbound messages this tenant has sent since `since`.
 *
 * Internal notes are excluded: they never reach WhatsApp, cost nothing, and are
 * stored on the same table only because they belong in the thread. Counting them
 * would let an agent jotting reminders to themselves exhaust the send budget.
 */
function outboundSince(tenantId: string, since: Date): Promise<number> {
  return prisma.message.count({
    where: {
      tenantId,
      direction: MessageDirection.OUTBOUND,
      isNote: false,
      createdAt: { gte: since },
    },
  });
}

export interface UsageMetric {
  used: number;
  limit: number;
}

export interface Usage {
  users: UsageMetric;
  contacts: UsageMetric;
  campaigns: UsageMetric;
  messages: UsageMetric;
  storageMb: UsageMetric;
  aiCredits: UsageMetric;
  businesses: UsageMetric;
  knowledgeDocs: UsageMetric;
  messagesToday: UsageMetric;
  messagesThisHour: UsageMetric;
  templates: UsageMetric;
  quickReplies: UsageMetric;
}

/** Sum of stored knowledge-doc content, in megabytes (chars ≈ bytes for text). */
async function storageMbUsed(tenantId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ bytes: bigint }[]>`
    SELECT COALESCE(SUM(LENGTH(COALESCE(content, ''))), 0)::bigint AS bytes
    FROM knowledge_docs WHERE "tenantId" = ${tenantId}
  `;
  const bytes = Number(rows[0]?.bytes ?? 0);
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

/** Compute the full usage snapshot for a tenant. */
export async function getUsage(tenantId: string): Promise<Usage> {
  const { subscription, limits } = await resolveTenantPlan(tenantId);
  const since = periodStart(subscription);

  const [
    users,
    contacts,
    campaigns,
    messages,
    storageMb,
    businesses,
    knowledgeDocs,
    today,
    thisHour,
    templates,
    quickReplies,
  ] = await Promise.all([
    prisma.user.count({ where: { tenantId, role: { not: "SUPER_ADMIN" } } }),
    prisma.contact.count({ where: { tenantId } }),
    prisma.campaign.count({ where: { tenantId, createdAt: { gte: since } } }),
    prisma.message.count({ where: { tenantId, createdAt: { gte: since } } }),
    storageMbUsed(tenantId),
    prisma.business.count({ where: { tenantId } }),
    prisma.knowledgeDoc.count({ where: { tenantId } }),
    outboundSince(tenantId, windowStart(24)),
    outboundSince(tenantId, windowStart(1)),
    prisma.messageTemplate.count({ where: { tenantId } }),
    prisma.quickReply.count({ where: { tenantId } }),
  ]);

  return {
    users: { used: users, limit: limits.users },
    contacts: { used: contacts, limit: limits.contacts },
    campaigns: { used: campaigns, limit: limits.campaigns },
    messages: { used: messages, limit: limits.messagesPerMonth },
    storageMb: { used: storageMb, limit: limits.storageMb },
    aiCredits: { used: subscription?.aiCreditsUsed ?? 0, limit: limits.aiCredits },
    businesses: { used: businesses, limit: limits.businesses },
    knowledgeDocs: { used: knowledgeDocs, limit: limits.knowledgeDocs },
    messagesToday: { used: today, limit: limits.messagesPerDay },
    messagesThisHour: { used: thisHour, limit: limits.messagesPerHour },
    templates: { used: templates, limit: limits.templates },
    quickReplies: { used: quickReplies, limit: limits.quickReplies },
  };
}

/**
 * Assert the tenant may add `increment` more of `resource`. Throws LimitError
 * (→ HTTP 403 with a friendly message) when the plan limit would be exceeded.
 * Enforcement can never be bypassed: every creation path calls this first.
 */
export async function assertWithinLimit(
  tenantId: string,
  resource: LimitResource,
  increment = 1,
): Promise<void> {
  const { subscription, limits, planName } = await resolveTenantPlan(tenantId);

  let used: number;
  let limit: number;
  switch (resource) {
    case "users":
      limit = limits.users;
      used = await prisma.user.count({ where: { tenantId, role: { not: "SUPER_ADMIN" } } });
      break;
    case "contacts":
      limit = limits.contacts;
      used = await prisma.contact.count({ where: { tenantId } });
      break;
    case "campaigns":
      limit = limits.campaigns;
      used = await prisma.campaign.count({ where: { tenantId, createdAt: { gte: periodStart(subscription) } } });
      break;
    case "storage":
      limit = limits.storageMb;
      used = await storageMbUsed(tenantId);
      break;
    case "ai":
      limit = limits.aiCredits;
      used = subscription?.aiCreditsUsed ?? 0;
      break;
    case "businesses":
      limit = limits.businesses;
      used = await prisma.business.count({ where: { tenantId } });
      break;
    case "knowledgeDocs":
      limit = limits.knowledgeDocs;
      used = await prisma.knowledgeDoc.count({ where: { tenantId } });
      break;
    // Rolling windows rather than calendar boundaries: a tenant that empties its
    // daily budget at 23:59 would otherwise get a fresh one a minute later, which
    // is exactly the burst the cap exists to prevent.
    case "messagesPerDay":
      limit = limits.messagesPerDay;
      used = await outboundSince(tenantId, windowStart(24));
      break;
    case "messagesPerHour":
      limit = limits.messagesPerHour;
      used = await outboundSince(tenantId, windowStart(1));
      break;
    case "templates":
      limit = limits.templates;
      used = await prisma.messageTemplate.count({ where: { tenantId } });
      break;
    case "quickReplies":
      limit = limits.quickReplies;
      used = await prisma.quickReply.count({ where: { tenantId } });
      break;
    // These two bound a single request, not a running total, so there is nothing
    // to count and no meaningful answer to give here. Routed to the wrong helper
    // they would silently pass, which is why this is a throw and not a `return`.
    case "campaignRecipients":
    case "uploadSize":
      throw new Error(
        `${resource} is a per-request ceiling — use assertBelowCeiling, not assertWithinLimit.`,
      );
  }

  if (isUnlimited(limit)) return;
  if (used + increment > limit) {
    throw new LimitError(
      { resource, used, limit, planName },
      `You've reached your plan limit of ${limit} ${RESOURCE_LABEL[resource]}. Upgrade your plan to add more.`,
    );
  }
}

/** Record consumed AI credits for the current period. Best-effort; never throws. */
export async function incrementAiUsage(tenantId: string, amount = 1): Promise<void> {
  try {
    await prisma.subscription.updateMany({
      where: { tenantId },
      data: { aiCreditsUsed: { increment: amount } },
    });
  } catch (error) {
    console.error("[BILLING] Failed to record AI usage:", error);
  }
}
