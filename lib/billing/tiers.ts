// ============================================================================
// MODULE : Billing tiers & limits
// ============================================================================
//
// Plans are stored in the DB (the Plan model, managed by super-admins), so the
// billing system is plan-agnostic and reads limits from whatever plans exist.
// This file only provides the FALLBACK limits used when a tenant has no
// subscription at all (treated as the free tier), plus a normaliser that maps a
// Plan row onto the limit shape the usage/enforcement code consumes.

import type { Plan } from "@prisma/client";

export interface PlanLimits {
  users: number;
  contacts: number;
  campaigns: number;
  storageMb: number;
  aiCredits: number;
}

/** Limits applied to a tenant with no subscription row (implicit free tier). */
export const FREE_TIER_LIMITS: PlanLimits = {
  users: 2,
  contacts: 100,
  campaigns: 2,
  storageMb: 100,
  aiCredits: 50,
};

export const FREE_TIER_NAME = "Free";

/** A limit of 0 or below means "unlimited". */
export function isUnlimited(limit: number): boolean {
  return limit <= 0;
}

/** Map a DB Plan onto the limit shape used for enforcement/usage. */
export function planLimits(plan: Plan): PlanLimits {
  return {
    users: plan.maxAgents,
    contacts: plan.maxContacts,
    campaigns: plan.maxCampaigns,
    storageMb: plan.maxStorageMb,
    aiCredits: plan.aiCredits,
  };
}
