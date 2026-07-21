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

import type { Plan, Subscription } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FREE_TIER_LIMITS, FREE_TIER_NAME, isUnlimited, planLimits, type PlanLimits } from "@/lib/billing/tiers";

export type LimitResource = "users" | "contacts" | "campaigns" | "storage" | "ai";

/** Thrown when an action would exceed the tenant's plan limit. Maps to HTTP 403. */
export class LimitError extends Error {
  resource: LimitResource;
  constructor(resource: LimitResource, message: string) {
    super(message);
    this.name = "LimitError";
    this.resource = resource;
  }
}

export interface ResolvedPlan {
  subscription: (Subscription & { plan: Plan }) | null;
  planName: string;
  limits: PlanLimits;
}

/** Resolve a tenant's effective plan + limits, falling back to the free tier. */
export async function resolveTenantPlan(tenantId: string): Promise<ResolvedPlan> {
  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
    include: { plan: true },
  });
  if (!subscription) {
    return { subscription: null, planName: FREE_TIER_NAME, limits: FREE_TIER_LIMITS };
  }
  return {
    subscription,
    planName: subscription.plan.displayName || subscription.plan.name,
    limits: planLimits(subscription.plan),
  };
}

/** The start of the current billing period (subscription anchor, else month start). */
function periodStart(subscription: (Subscription & { plan: Plan }) | null): Date {
  if (subscription?.currentPeriodStart) return subscription.currentPeriodStart;
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
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
  const msgLimit = subscription?.plan.maxMsgPerMonth ?? 1000;

  const [users, contacts, campaigns, messages, storageMb] = await Promise.all([
    prisma.user.count({ where: { tenantId, role: { not: "SUPER_ADMIN" } } }),
    prisma.contact.count({ where: { tenantId } }),
    prisma.campaign.count({ where: { tenantId, createdAt: { gte: since } } }),
    prisma.message.count({ where: { tenantId, createdAt: { gte: since } } }),
    storageMbUsed(tenantId),
  ]);

  return {
    users: { used: users, limit: limits.users },
    contacts: { used: contacts, limit: limits.contacts },
    campaigns: { used: campaigns, limit: limits.campaigns },
    messages: { used: messages, limit: msgLimit },
    storageMb: { used: storageMb, limit: limits.storageMb },
    aiCredits: { used: subscription?.aiCreditsUsed ?? 0, limit: limits.aiCredits },
  };
}

const RESOURCE_LABEL: Record<LimitResource, string> = {
  users: "team members",
  contacts: "contacts",
  campaigns: "campaigns this billing period",
  storage: "knowledge storage",
  ai: "AI requests",
};

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
  const { subscription, limits } = await resolveTenantPlan(tenantId);

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
  }

  if (isUnlimited(limit)) return;
  if (used + increment > limit) {
    throw new LimitError(
      resource,
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
