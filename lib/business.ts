// ============================================================================
// MODULE : Business (Workspace) context resolution
// ============================================================================
//
// A Tenant owns many Businesses; every operational query in the app is scoped to
// ONE of them — "the current business". This module is the single place that
// answers "which business is this request acting on?" so no route has to reinvent
// the cookie read, the tenant-ownership check, or the fallback.
//
// Selection is persisted in an httpOnly cookie (CURRENT_BUSINESS_COOKIE) rather
// than on the JWT: switching business must take effect on the very next request
// without re-issuing the session token, and the choice is always re-validated
// against the tenant server-side so a tampered cookie can never point at another
// tenant's data.
//
// Backward compatibility (Step 11): a tenant that predates this feature has no
// Business rows. getBusinessScope() / ensureDefaultBusiness() lazily create one
// "default" business per tenant, seeded from that tenant's existing WhatsApp + AI
// settings, so a single-business installation keeps working with zero manual steps.

import { cookies } from "next/headers";
import type { Business } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

/** Cookie that remembers the business the user last switched to. */
export const CURRENT_BUSINESS_COOKIE = "current_business";

/** One year — the selection is a long-lived preference, re-validated every request. */
export const BUSINESS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * The resolved acting context for a request: who, which tenant, which business.
 * Returned by getBusinessScope() and threaded into every scoped query in place of
 * the bare `session.user.tenantId` the app used before businesses existed.
 */
export interface BusinessScope {
  userId: string;
  role: string;
  tenantId: string;
  tenantName: string;
  businessId: string;
  business: Business;
}

/** URL-safe slug from a display name; empty input yields "business". */
export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "business";
}

/**
 * A slug unique within a tenant, appending -2, -3… on collision.
 * Businesses are unique on (slug, tenantId), so the slug only has to be unique
 * inside the one tenant, never globally.
 */
export async function uniqueBusinessSlug(tenantId: string, base: string, excludeId?: string): Promise<string> {
  const root = slugify(base);
  let candidate = root;
  let n = 1;
  // Bounded loop: in practice one or two iterations; the cap guards a pathological tenant.
  while (n < 1000) {
    const clash = await prisma.business.findFirst({
      where: { tenantId, slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (!clash) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
  return `${root}-${Date.now()}`;
}

/**
 * Guarantee the tenant has at least one Business, returning its first (oldest) one.
 *
 * The default is seeded from the tenant's existing TenantSettings so a pre-existing
 * single-number setup migrates transparently — the same WhatsApp credentials, AI
 * flags and prompt the tenant already had now live on a business the webhook can
 * route to. Idempotent: a tenant that already has a business is returned unchanged.
 */
export async function ensureDefaultBusiness(tenantId: string): Promise<Business> {
  const existing = await prisma.business.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { settings: true },
  });
  const s = tenant?.settings;

  // The Meta phone_number_id is globally unique across businesses; if some other
  // business already claims it (dirty data), fall back to null rather than fail —
  // the tenant can re-enter credentials from the business settings screen.
  let phoneNumberId = s?.waPhoneNumberId ?? null;
  if (phoneNumberId) {
    const taken = await prisma.business.findUnique({
      where: { whatsappPhoneNumberId: phoneNumberId },
      select: { id: true },
    });
    if (taken) phoneNumberId = null;
  }

  return prisma.business.create({
    data: {
      tenantId,
      name: tenant?.name ?? "My Business",
      slug: "default",
      whatsappPhoneNumber: s?.waPhoneNumberId ?? null,
      whatsappPhoneNumberId: phoneNumberId,
      whatsappBusinessId: s?.waBusinessAccountId ?? null,
      whatsappAccessToken: s?.waApiKey ?? null,
      whatsappVerifyToken: s?.waWebhookVerifyToken ?? null,
      timezone: s?.timezone ?? "Asia/Kolkata",
      aiEnabled: s?.aiEnabled ?? false,
      autoReply: s?.autoReply ?? false,
      autoReplyDelay: s?.autoReplyDelay ?? 3,
      aiModel: s?.aiModel ?? null,
      aiSystemPrompt: null,
      aiPersonality: s?.aiPersonality ?? null,
      aiResponseTone: null,
      aiTemperature: 0.7,
      aiMaxTokens: 500,
      offHoursMessage: s?.offHoursMessage ?? null,
    },
  });
}

/**
 * Resolve the current business for a signed-in request.
 *
 * Order of preference: the cookie's business (only if it belongs to this tenant),
 * else the tenant's oldest business, else a freshly created default. Returns null
 * only when there is no session — an authenticated user always ends up with a
 * business, which is what lets every downstream route treat businessId as present.
 */
export async function getBusinessScope(): Promise<BusinessScope | null> {
  const session = await auth();
  if (!session?.user) return null;

  const { tenantId } = session.user;
  const cookieStore = await cookies();
  const requested = cookieStore.get(CURRENT_BUSINESS_COOKIE)?.value;

  let business: Business | null = null;
  if (requested) {
    // Ownership is enforced in the query: a cookie naming another tenant's business
    // simply misses and falls through to the tenant's own default.
    business = await prisma.business.findFirst({ where: { id: requested, tenantId } });
  }
  if (!business) {
    business = await prisma.business.findFirst({ where: { tenantId }, orderBy: { createdAt: "asc" } });
  }
  if (!business) {
    business = await ensureDefaultBusiness(tenantId);
  }

  return {
    userId: session.user.id,
    role: session.user.role,
    tenantId,
    tenantName: session.user.tenantName,
    businessId: business.id,
    business,
  };
}

/** Every business belonging to a tenant, newest activity first for the switcher. */
export async function listBusinesses(tenantId: string) {
  return prisma.business.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Whether this business is the tenant's original one — the row `ensureDefaultBusiness`
 * seeds from `TenantSettings`.
 *
 * This is the seam between "one workspace, configured before businesses existed" and "several
 * independent workspaces". The tenant-level `TenantSettings` row is the legacy home of the
 * WhatsApp credentials and the AI flags, and it is still consulted — but only for this one
 * business. Every business created afterwards reads its own columns and nothing else, which is
 * what stops a workspace that has not been configured from silently borrowing another one's
 * number, token or AI persona.
 *
 * "Oldest" is the same rule `getBusinessScope` and `ensureDefaultBusiness` already use to pick a
 * tenant's default, so there is one definition of "the original business", not two.
 */
async function isTenantDefaultBusiness(tenantId: string, businessId: string): Promise<boolean> {
  const oldest = await prisma.business.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return oldest?.id === businessId;
}

/** Public form of the check above, for routes that must know whether legacy settings apply. */
export async function isLegacySettingsBusiness(tenantId: string, businessId: string): Promise<boolean> {
  return isTenantDefaultBusiness(tenantId, businessId);
}

/** WhatsApp credentials resolved for a business, with the token already decrypted. */
export interface ResolvedWhatsAppCreds {
  phoneNumberId: string | null;
  businessAccountId: string | null;
  /** Decrypted access token, or null when unavailable / undecryptable. */
  apiKey: string | null;
  verifyToken: string | null;
}

/**
 * Resolve a business's WhatsApp credentials for sending, decrypting the token.
 *
 * Business-level credentials win. Anything the business has not set falls back to the tenant's
 * legacy TenantSettings — but only when this business *is* the tenant's original one, so a
 * workspace that configured WhatsApp before businesses existed keeps sending without re-entering
 * anything, while a newly created workspace that has not been connected yet reports "not
 * connected" instead of quietly sending from another workspace's number. That distinction is the
 * whole point of `isTenantDefaultBusiness`: an unscoped fallback is a settings leak across
 * workspaces, which is exactly what the per-workspace settings work exists to remove.
 *
 * This is the single creds source for the message route, the campaign runner and the connection
 * test, so isolation and backward compatibility are decided in exactly one place.
 */
export async function resolveWhatsAppCreds(businessId: string): Promise<ResolvedWhatsAppCreds> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      tenantId: true,
      whatsappPhoneNumberId: true,
      whatsappBusinessId: true,
      whatsappAccessToken: true,
      whatsappVerifyToken: true,
    },
  });
  if (!business) return { phoneNumberId: null, businessAccountId: null, apiKey: null, verifyToken: null };

  let phoneNumberId = business.whatsappPhoneNumberId;
  let businessAccountId = business.whatsappBusinessId;
  let token = business.whatsappAccessToken;
  let verifyToken = business.whatsappVerifyToken;

  if (
    (!phoneNumberId || !businessAccountId || !token) &&
    (await isTenantDefaultBusiness(business.tenantId, businessId))
  ) {
    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId: business.tenantId },
      select: {
        waPhoneNumberId: true,
        waBusinessAccountId: true,
        waApiKey: true,
        waWebhookVerifyToken: true,
      },
    });
    phoneNumberId = phoneNumberId ?? settings?.waPhoneNumberId ?? null;
    businessAccountId = businessAccountId ?? settings?.waBusinessAccountId ?? null;
    token = token ?? settings?.waApiKey ?? null;
    verifyToken = verifyToken ?? settings?.waWebhookVerifyToken ?? null;
  }

  let apiKey: string | null = null;
  try {
    apiKey = decryptSecret(token);
  } catch (error) {
    console.error("[WA CREDS] Failed to decrypt WhatsApp token:", error);
  }

  return { phoneNumberId, businessAccountId, apiKey, verifyToken };
}

/**
 * The AI / auto-reply configuration that applies to one workspace.
 *
 * Mirrors the five fields the inbound pipeline actually reads before it drafts a reply. Kept as
 * its own type rather than a partial Business so that the resolution rule below — business first,
 * legacy tenant settings only for the tenant's original business — has one shape to return and
 * one place to be understood.
 */
export interface ResolvedAiConfig {
  aiEnabled: boolean;
  autoReply: boolean;
  autoReplyDelay: number;
  aiModel: string | null;
  aiPersonality: string | null;
}

/**
 * Resolve the AI configuration for one workspace.
 *
 * Every field lives on `Business`, which is what makes the setting per-workspace: enabling the
 * assistant for one WhatsApp account must not enable it for the tenant's other accounts, and the
 * inbound worker reads this rather than the tenant row for exactly that reason.
 *
 * The tenant's legacy `TenantSettings` is still honoured for the tenant's *original* business, and
 * only there. The booleans are OR-ed rather than overridden for that one business because a
 * deployment that predates per-business AI has the flags on the tenant row and `false` on the
 * business row — reading the business alone would silently switch its auto-replies off. The write
 * path (PATCH /api/settings/ai) keeps both rows in step for that business, so turning the
 * assistant off still turns it off; see the mirror there.
 *
 * Returns null when the business does not exist, which callers treat as "AI off".
 */
export async function resolveAiConfig(businessId: string): Promise<ResolvedAiConfig | null> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      tenantId: true,
      aiEnabled: true,
      autoReply: true,
      autoReplyDelay: true,
      aiModel: true,
      aiPersonality: true,
    },
  });
  if (!business) return null;

  const config: ResolvedAiConfig = {
    aiEnabled: business.aiEnabled,
    autoReply: business.autoReply,
    autoReplyDelay: business.autoReplyDelay,
    aiModel: business.aiModel,
    aiPersonality: business.aiPersonality,
  };

  if (!(await isTenantDefaultBusiness(business.tenantId, businessId))) return config;

  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId: business.tenantId },
    select: {
      aiEnabled: true,
      autoReply: true,
      autoReplyDelay: true,
      aiModel: true,
      aiPersonality: true,
    },
  });
  if (!settings) return config;

  return {
    aiEnabled: config.aiEnabled || settings.aiEnabled,
    autoReply: config.autoReply || settings.autoReply,
    // The business column is non-nullable with a schema default, so "unset" cannot be told from
    // "deliberately 3". The tenant value wins only where the business still carries that default.
    autoReplyDelay: config.autoReplyDelay === 3 ? settings.autoReplyDelay : config.autoReplyDelay,
    aiModel: config.aiModel || settings.aiModel,
    aiPersonality: config.aiPersonality || settings.aiPersonality,
  };
}

/**
 * A business shaped for the client: the encrypted access token is never sent —
 * only a boolean flag saying whether one is configured. Everything else is safe
 * to expose to any member of the owning tenant.
 */
export function publicBusiness(b: Business) {
  const { whatsappAccessToken, whatsappVerifyToken, ...rest } = b;
  return {
    ...rest,
    hasWhatsappToken: Boolean(whatsappAccessToken),
    hasWhatsappVerifyToken: Boolean(whatsappVerifyToken),
  };
}
