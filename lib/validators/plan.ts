import { z } from "zod";

// ============================================================================
// MODULE : Plan write validation (super-admin)
// ============================================================================
//
// One vocabulary for both admin plan routes, so a rule cannot be tightened on
// create and left loose on update.
//
// Every numeric cap is `nonnegative`, never `positive`. Zero is the "unlimited"
// sentinel the enforcement layer reads (isUnlimited in lib/billing/tiers.ts), so
// rejecting it would make unlimited tiers impossible to express — which is
// precisely what a negotiated enterprise plan is usually sold as. Prices are
// nonnegative for the same reason in the other direction: a comped custom plan
// is ₹0, and that is a legitimate deal rather than a typo.

/**
 * Field rules with NO defaults attached.
 *
 * Kept default-free on purpose: `z.object(...).partial()` in zod 4 still applies
 * a field's default when the key is absent, so a PATCH schema derived from a
 * defaulted create schema would quietly reset every field the admin did not
 * send. Defaults are layered on by `createPlanSchema` alone.
 */
const planRules = {
  displayName: z.string().min(1),
  description: z.string().nullable(),

  priceMonthly: z.number().nonnegative(),
  priceAnnual: z.number().nonnegative(),

  maxContacts: z.number().int().nonnegative(),
  maxMsgPerMonth: z.number().int().nonnegative(),
  maxAgents: z.number().int().nonnegative(),
  maxCampaigns: z.number().int().nonnegative(),
  maxFlows: z.number().int().nonnegative(),
  maxStorageMb: z.number().int().nonnegative(),
  aiCredits: z.number().int().nonnegative(),
  maxMsgPerDay: z.number().int().nonnegative(),
  maxMsgPerHour: z.number().int().nonnegative(),
  maxBusinesses: z.number().int().nonnegative(),
  maxKnowledgeDocs: z.number().int().nonnegative(),
  maxTemplates: z.number().int().nonnegative(),
  maxQuickReplies: z.number().int().nonnegative(),
  maxCampaignRecipients: z.number().int().nonnegative(),
  maxUploadMb: z.number().int().nonnegative(),

  // 0 means "keep forever", not "delete immediately" — the retention cron skips
  // any plan at 0. See app/api/cron/retention/route.ts.
  retentionDays: z.number().int().nonnegative(),

  allowedAiModels: z.array(z.string().min(1)),
  allowExport: z.boolean(),
  isPopular: z.boolean(),
  aiEnabled: z.boolean(),
  ragEnabled: z.boolean(),
  whiteLabel: z.boolean(),
  advancedAi: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),

  // Empty string is coerced to null rather than rejected: the admin form clears
  // this field by submitting "", and a blank price id must mean "invoiced
  // offline", not a Stripe lookup that will never match.
  stripePriceId: z
    .string()
    .trim()
    .nullable()
    .transform((v) => (v ? v : null)),

  visibility: z.enum(["PUBLIC", "PRIVATE"]),
  ownerTenantId: z.string().min(1).nullable(),
};

export const createPlanSchema = z.object({
  ...planRules,

  // Optional on create and never editable afterwards. For a custom tier the
  // route generates it (see generateCustomPlanName) — the machine key is not
  // something a super-admin should have to invent, they name the card in
  // displayName. A public plan must still be given one explicitly.
  name: z
    .string()
    .min(1)
    .regex(/^[A-Z0-9_]+$/, "name must be uppercase letters, digits and underscores")
    .optional(),

  description: planRules.description.optional(),
  maxFlows: planRules.maxFlows.default(5),
  maxStorageMb: planRules.maxStorageMb.default(1024),
  aiCredits: planRules.aiCredits.default(0),
  maxMsgPerDay: planRules.maxMsgPerDay.default(0),
  maxMsgPerHour: planRules.maxMsgPerHour.default(0),
  maxBusinesses: planRules.maxBusinesses.default(1),
  maxKnowledgeDocs: planRules.maxKnowledgeDocs.default(0),
  maxTemplates: planRules.maxTemplates.default(0),
  maxQuickReplies: planRules.maxQuickReplies.default(0),
  maxCampaignRecipients: planRules.maxCampaignRecipients.default(0),
  maxUploadMb: planRules.maxUploadMb.default(10),
  retentionDays: planRules.retentionDays.default(0),
  allowedAiModels: planRules.allowedAiModels.default([]),
  allowExport: planRules.allowExport.default(true),
  isPopular: planRules.isPopular.default(false),
  aiEnabled: planRules.aiEnabled.default(false),
  ragEnabled: planRules.ragEnabled.default(false),
  whiteLabel: planRules.whiteLabel.default(false),
  advancedAi: planRules.advancedAi.default(false),
  isActive: planRules.isActive.default(true),
  sortOrder: planRules.sortOrder.default(0),
  stripePriceId: planRules.stripePriceId.default(null),
  visibility: planRules.visibility.default("PUBLIC"),
  ownerTenantId: planRules.ownerTenantId.default(null),
});

/** Every field optional, no defaults — a PATCH touches only what it sends. */
export const updatePlanSchema = z.object(planRules).partial();

export type PlanWriteInput = z.infer<typeof updatePlanSchema>;

/**
 * Apply the two rules that tie visibility, ownership and the popular badge
 * together. Returns either the corrected data or the reason it cannot be saved.
 *
 * `current` carries the row being updated, so a PATCH that changes only
 * `ownerTenantId` is still judged against the visibility already stored.
 */
export function resolvePlanScope<T extends PlanWriteInput>(
  input: T,
  current?: { visibility: "PUBLIC" | "PRIVATE"; ownerTenantId: string | null } | null,
): { ok: true; data: T } | { ok: false; error: string } {
  const visibility = input.visibility ?? current?.visibility ?? "PUBLIC";
  const ownerTenantId =
    input.ownerTenantId !== undefined ? input.ownerTenantId : (current?.ownerTenantId ?? null);

  if (visibility === "PUBLIC" && ownerTenantId) {
    return {
      ok: false,
      error:
        "A public plan cannot belong to a tenant — set visibility to PRIVATE, or clear the owner.",
    };
  }

  // A hidden card cannot be the popular one. Silently corrected rather than
  // refused: the flag usually arrives because the admin cloned a public plan
  // that happened to hold the badge, and failing the save over a ribbon nobody
  // will ever see would be a worse answer than dropping it.
  return {
    ok: true,
    data: {
      ...input,
      ...(visibility === "PRIVATE" && input.isPopular ? { isPopular: false } : {}),
    },
  };
}
