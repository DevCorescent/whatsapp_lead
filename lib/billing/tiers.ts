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
  businesses: number;
  knowledgeDocs: number;
  messagesPerMonth: number;
  messagesPerDay: number;
  messagesPerHour: number;
  templates: number;
  quickReplies: number;
  campaignRecipients: number;
  uploadMb: number;
}

/** The non-numeric half of a plan: what the tier switches on rather than caps. */
export interface PlanGrants {
  aiEnabled: boolean;
  ragEnabled: boolean;
  whiteLabel: boolean;
  advancedAi: boolean;
  allowExport: boolean;
  /** Empty means every model is permitted. */
  allowedAiModels: string[];
  /** Days of message history retained. 0 keeps everything. */
  retentionDays: number;
}

/**
 * Grants for a tenant with no subscription. Every paid feature is off — the free
 * tier is the one case where defaulting open would give away the product, so the
 * fallback has to be the closed one.
 */
export const FREE_TIER_GRANTS: PlanGrants = {
  aiEnabled: false,
  ragEnabled: false,
  whiteLabel: false,
  advancedAi: false,
  allowExport: false,
  allowedAiModels: [],
  retentionDays: 30,
};

/** Limits applied to a tenant with no subscription row (implicit free tier). */
export const FREE_TIER_LIMITS: PlanLimits = {
  users: 2,
  contacts: 100,
  campaigns: 2,
  storageMb: 100,
  aiCredits: 50,
  businesses: 1,
  knowledgeDocs: 5,
  messagesPerMonth: 1000,
  messagesPerDay: 100,
  messagesPerHour: 20,
  templates: 3,
  quickReplies: 5,
  campaignRecipients: 50,
  uploadMb: 2,
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
    businesses: plan.maxBusinesses,
    knowledgeDocs: plan.maxKnowledgeDocs,
    messagesPerMonth: plan.maxMsgPerMonth,
    messagesPerDay: plan.maxMsgPerDay,
    messagesPerHour: plan.maxMsgPerHour,
    templates: plan.maxTemplates,
    quickReplies: plan.maxQuickReplies,
    campaignRecipients: plan.maxCampaignRecipients,
    uploadMb: plan.maxUploadMb,
  };
}

/** Map a DB Plan onto the feature grants used for gating. */
export function planGrants(plan: Plan): PlanGrants {
  return {
    aiEnabled: plan.aiEnabled,
    ragEnabled: plan.ragEnabled,
    whiteLabel: plan.whiteLabel,
    advancedAi: plan.advancedAi,
    allowExport: plan.allowExport,
    allowedAiModels: plan.allowedAiModels,
    retentionDays: plan.retentionDays,
  };
}
