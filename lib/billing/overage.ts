// ============================================================================
// MODULE : Downgrade overage check (shared server / client)
// ============================================================================
//
// Moving a tenant onto a smaller plan does not delete anything — the enforcement
// layer only refuses the NEXT create — so a workspace can sit indefinitely at
// 400 contacts on a 200-contact plan, unable to add one more and with nothing on
// screen explaining why. The admin assigning that plan is the only person in a
// position to notice, so the answer is to show them before they save.
//
// Imports neither Prisma nor the database, so the admin panel can run the same
// comparison client-side as a live preview and the route can run it again for
// the record. A super-admin clamping a tenant on purpose is a legitimate thing
// to do, so this reports and never refuses.

/** Live counts for a tenant, as produced by getUsage(). */
export interface UsedCounts {
  users: number;
  contacts: number;
  campaigns: number;
  storageMb: number;
  aiCredits: number;
  businesses: number;
  knowledgeDocs: number;
  messages: number;
  templates: number;
  quickReplies: number;
}

/** The Plan columns this compares against — a structural subset of Plan. */
export interface PlanCaps {
  maxAgents: number;
  maxContacts: number;
  maxCampaigns: number;
  maxStorageMb: number;
  aiCredits: number;
  maxBusinesses: number;
  maxKnowledgeDocs: number;
  maxMsgPerMonth: number;
  maxTemplates: number;
  maxQuickReplies: number;
}

export interface Overage {
  label: string;
  used: number;
  limit: number;
}

/**
 * Which of the tenant's current counts exceed the caps on `plan`.
 *
 * Rate windows (messages per day / hour) and per-request ceilings (recipients
 * per campaign, upload size) are deliberately absent: those bound a single
 * future action rather than a standing total, so there is no stored quantity
 * that can already be "over" one.
 */
export function planOverages(used: UsedCounts, plan: PlanCaps): Overage[] {
  const rows: { label: string; used: number; limit: number }[] = [
    { label: "team members", used: used.users, limit: plan.maxAgents },
    { label: "contacts", used: used.contacts, limit: plan.maxContacts },
    { label: "campaigns this period", used: used.campaigns, limit: plan.maxCampaigns },
    { label: "MB of storage", used: used.storageMb, limit: plan.maxStorageMb },
    { label: "AI credits used this period", used: used.aiCredits, limit: plan.aiCredits },
    { label: "businesses", used: used.businesses, limit: plan.maxBusinesses },
    { label: "knowledge base documents", used: used.knowledgeDocs, limit: plan.maxKnowledgeDocs },
    { label: "messages this period", used: used.messages, limit: plan.maxMsgPerMonth },
    { label: "message templates", used: used.templates, limit: plan.maxTemplates },
    { label: "quick replies", used: used.quickReplies, limit: plan.maxQuickReplies },
  ];

  // A limit of 0 or below is the "unlimited" sentinel (isUnlimited in
  // lib/billing/tiers.ts), not a cap of nothing — comparing against it literally
  // would report every tenant as over every unlimited allowance they were
  // just granted.
  return rows.filter((r) => r.limit > 0 && r.used > r.limit);
}
