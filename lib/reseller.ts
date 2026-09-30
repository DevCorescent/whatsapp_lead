// ============================================================================
// MODULE : Reseller plans
//
// A reseller sells the platform under its own plan names and prices. Each
// reseller plan is built on a platform plan (`basePlanId`): its limits are copied
// from the base and can't be raised, and its price can't go below the base
// plan's — the reseller earns through commission and its own margin, never by
// handing out capacity the platform didn't sell. Reseller plans are PRIVATE, so
// they never appear on the public pricing page; lib/billing/plans.ts shows them
// only to that reseller's clients.
// ============================================================================

import { randomBytes } from "crypto";
import type { Plan, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Platform plans a reseller may build on: public, active, not another reseller's. */
export const BASE_PLAN_WHERE: Prisma.PlanWhereInput = { visibility: "PUBLIC", isActive: true, resellerId: null };

/**
 * Plans a reseller may put its clients on: its own active plans, or — if it has
 * none — the platform's public plans.
 */
export async function assignablePlans(resellerId: string) {
  const own = await prisma.plan.findMany({
    where: { resellerId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { priceMonthly: "asc" }],
  });
  if (own.length > 0) return own;
  return prisma.plan.findMany({ where: BASE_PLAN_WHERE, orderBy: [{ sortOrder: "asc" }, { priceMonthly: "asc" }] });
}

export async function isAssignablePlan(resellerId: string, planId: string): Promise<boolean> {
  return (await assignablePlans(resellerId)).some((p) => p.id === planId);
}

/** Columns a reseller plan inherits from its base plan — the capacity and features sold. */
function inherited(base: Plan) {
  return {
    maxContacts: base.maxContacts,
    maxMsgPerMonth: base.maxMsgPerMonth,
    maxAgents: base.maxAgents,
    maxCampaigns: base.maxCampaigns,
    maxFlows: base.maxFlows,
    maxStorageMb: base.maxStorageMb,
    aiCredits: base.aiCredits,
    maxMsgPerDay: base.maxMsgPerDay,
    maxMsgPerHour: base.maxMsgPerHour,
    maxBusinesses: base.maxBusinesses,
    maxKnowledgeDocs: base.maxKnowledgeDocs,
    maxTemplates: base.maxTemplates,
    maxQuickReplies: base.maxQuickReplies,
    maxCampaignRecipients: base.maxCampaignRecipients,
    maxUploadMb: base.maxUploadMb,
    retentionDays: base.retentionDays,
    allowedAiModels: base.allowedAiModels,
    allowExport: base.allowExport,
    aiEnabled: base.aiEnabled,
    ragEnabled: base.ragEnabled,
    whiteLabel: base.whiteLabel,
    advancedAi: base.advancedAi,
    features: base.features,
  };
}

export class ResellerPlanError extends Error {}

export async function createResellerPlan(
  resellerId: string,
  input: { displayName: string; description?: string | null; basePlanId: string; priceMonthly: number; priceAnnual?: number | null },
) {
  const base = await prisma.plan.findFirst({ where: { id: input.basePlanId, ...BASE_PLAN_WHERE } });
  if (!base) throw new ResellerPlanError("Base plan not found");
  if (input.priceMonthly < base.priceMonthly) {
    throw new ResellerPlanError(`Monthly price can't be below the platform price (₹${base.priceMonthly})`);
  }
  const priceAnnual = input.priceAnnual ?? input.priceMonthly * 12;
  if (priceAnnual < base.priceAnnual) {
    throw new ResellerPlanError(`Annual price can't be below the platform price (₹${base.priceAnnual})`);
  }

  return prisma.plan.create({
    data: {
      ...inherited(base),
      name: `RSL_${resellerId.slice(-6).toUpperCase()}_${randomBytes(4).toString("hex").toUpperCase()}`,
      displayName: input.displayName.trim(),
      description: input.description?.trim() || null,
      priceMonthly: input.priceMonthly,
      priceAnnual,
      visibility: "PRIVATE",
      resellerId,
      basePlanId: base.id,
      sortOrder: base.sortOrder,
    },
  });
}

/** Price floor for an existing reseller plan (its base plan's prices). */
export async function basePrices(plan: { basePlanId: string | null }) {
  if (!plan.basePlanId) return { priceMonthly: 0, priceAnnual: 0 };
  const base = await prisma.plan.findUnique({ where: { id: plan.basePlanId }, select: { priceMonthly: true, priceAnnual: true } });
  return base ?? { priceMonthly: 0, priceAnnual: 0 };
}
