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
import type { Business, WhatsAppIntegration } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptSecret, isMetaAccessToken } from "@/lib/crypto";
import { findDefaultIntegration } from "@/lib/whatsappIntegrations";
import { checkIntegrationOwnership } from "@/lib/whatsappIntegrationRules";

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

/** WhatsApp credentials resolved for a business, with the token already decrypted. */
export interface ResolvedWhatsAppCreds {
  phoneNumberId: string | null;
  businessAccountId: string | null;
  /** Decrypted access token, or null when unavailable / undecryptable. */
  apiKey: string | null;
  verifyToken: string | null;
  /** The WhatsAppIntegration these came from; null for legacy Business/TenantSettings creds. */
  integrationId: string | null;
  /**
   * Set when no usable credentials were returned and the caller must refuse rather than
   * look elsewhere — e.g. the thread's own number was disconnected. Safe to show operators.
   */
  unavailableReason?: string;
}

const NO_CREDS: ResolvedWhatsAppCreds = {
  phoneNumberId: null,
  businessAccountId: null,
  apiKey: null,
  verifyToken: null,
  integrationId: null,
};

/** Decrypt one integration's token. Never falls back to another number's token. */
function credsFromIntegration(row: WhatsAppIntegration): ResolvedWhatsAppCreds {
  let apiKey: string | null = null;
  try {
    apiKey = decryptSecret(row.accessToken);
  } catch (error) {
    console.error("[WA CREDS] Failed to decrypt integration token", {
      integrationId: row.id,
      businessId: row.businessId,
      reason: error instanceof Error ? error.message : "unknown",
    });
  }
  if (apiKey && !isMetaAccessToken(apiKey)) apiKey = null;

  return {
    phoneNumberId: row.phoneNumberId,
    businessAccountId: row.whatsappBusinessId,
    apiKey,
    verifyToken: row.verifyToken ?? null,
    integrationId: row.id,
    ...(!apiKey && {
      unavailableReason: "The access token for this WhatsApp number is unusable. Reconnect the number.",
    }),
  };
}

/**
 * Credentials a business sends with when no conversation pins a number — campaigns,
 * template management, anything addressed to "the business" rather than to a thread.
 *
 * The business's default WhatsApp number wins; a business with no connected numbers
 * falls back to the legacy Business columns and then TenantSettings, exactly as before
 * multi-number support existed.
 */
export async function resolveWhatsAppCreds(businessId: string): Promise<ResolvedWhatsAppCreds> {
  const integration = await findDefaultIntegration(businessId);
  if (integration) return credsFromIntegration(integration);
  return resolveLegacyWhatsAppCreds(businessId);
}

/**
 * Credentials for replying inside a conversation: always the number the customer wrote to.
 *
 * A thread with a number is answered from that number or not at all. If the number was
 * disconnected, or now belongs to another business, the result carries
 * `unavailableReason` and no token — silently answering from a different number would
 * show the customer a stranger's number mid-conversation.
 *
 * Threads from before multi-number support have no number. Those were received on the
 * legacy credentials, so the legacy chain is tried first and the default number is only
 * used when there are no legacy credentials at all.
 */
export async function resolveConversationWhatsAppCreds(conversation: {
  businessId: string;
  tenantId?: string;
  whatsappIntegrationId?: string | null;
}): Promise<ResolvedWhatsAppCreds> {
  if (conversation.whatsappIntegrationId) {
    const row = await prisma.whatsAppIntegration.findUnique({
      where: { id: conversation.whatsappIntegrationId },
    });
    const owned = checkIntegrationOwnership(row, {
      businessId: conversation.businessId,
      tenantId: conversation.tenantId,
    });
    if (!owned.ok) {
      return {
        ...NO_CREDS,
        unavailableReason:
          owned.reason === "inactive"
            ? "The WhatsApp number this conversation uses has been disconnected. Reconnect it to reply."
            : "The WhatsApp number this conversation uses is no longer connected to this business.",
      };
    }
    return credsFromIntegration(owned.integration);
  }

  const legacy = await resolveLegacyWhatsAppCreds(conversation.businessId);
  if (legacy.phoneNumberId && legacy.apiKey) return legacy;

  const integration = await findDefaultIntegration(conversation.businessId);
  return integration ? credsFromIntegration(integration) : legacy;
}

/**
 * Legacy (pre multi-number) credential resolution, decrypting the token.
 *
 * Business-level credentials win; anything the business hasn't set falls back to
 * the tenant's legacy TenantSettings so a workspace that configured WhatsApp
 * before businesses existed (or only ever uses one business) keeps sending
 * without re-entering anything. Only reached through resolveWhatsAppCreds /
 * resolveConversationWhatsAppCreds above, after WhatsAppIntegration rows.
 */
async function resolveLegacyWhatsAppCreds(businessId: string): Promise<ResolvedWhatsAppCreds> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      tenantId: true,
      name: true,
      whatsappPhoneNumberId: true,
      whatsappBusinessId: true,
      whatsappAccessToken: true,
      whatsappVerifyToken: true,
    },
  });
  if (!business) return NO_CREDS;

  let phoneNumberId = business.whatsappPhoneNumberId;
  let businessAccountId = business.whatsappBusinessId;
  let token = business.whatsappAccessToken;
  let verifyToken = business.whatsappVerifyToken;
  let tokenSource: "business" | "tenant" | "none" = token ? "business" : "none";

  if (!phoneNumberId || !businessAccountId || !token) {
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
    if (!token && settings?.waApiKey) {
      token = settings.waApiKey;
      tokenSource = "tenant";
    }
    verifyToken = verifyToken ?? settings?.waWebhookVerifyToken ?? null;
  }

  let apiKey: string | null = null;
  try {
    apiKey = decryptSecret(token);
  } catch (error) {
    console.error("[WA CREDS] Failed to decrypt WhatsApp token:", {
      businessId,
      businessName: business.name,
      tokenSource,
      storedLooksEncrypted: Boolean(token && token.trim().startsWith("enc:v1:")),
      storedLength: token?.length ?? 0,
      error,
    });
  }

  // Placeholder values like "Demo" were saved as the access token for this business.
  // Never send those to Meta — try TenantSettings, otherwise clear apiKey so send is skipped.
  if (apiKey && !isMetaAccessToken(apiKey)) {
    console.error("[WA CREDS] Token does not look like a Meta WhatsApp access token", {
      businessId,
      businessName: business.name,
      tokenSource,
      length: apiKey.length,
      prefix: apiKey.slice(0, 4),
    });

    if (tokenSource === "business") {
      const settings = await prisma.tenantSettings.findUnique({
        where: { tenantId: business.tenantId },
        select: { waApiKey: true, waPhoneNumberId: true, waBusinessAccountId: true },
      });
      if (settings?.waApiKey) {
        try {
          const fallback = decryptSecret(settings.waApiKey);
          if (isMetaAccessToken(fallback)) {
            apiKey = fallback;
            tokenSource = "tenant";
            // Keep token + phone number id as one pair from TenantSettings.
            // Mixing a tenant token with a stale business phoneNumberId causes Meta 400s.
            phoneNumberId = settings.waPhoneNumberId ?? phoneNumberId;
            businessAccountId = settings.waBusinessAccountId ?? businessAccountId;
            console.warn("[WA CREDS] Fell back to TenantSettings token — business token was invalid", {
              businessId,
              phoneNumberId,
            });
          } else {
            apiKey = null;
          }
        } catch {
          apiKey = null;
        }
      } else {
        apiKey = null;
      }
    } else {
      apiKey = null;
    }
  }

  if (apiKey && isMetaAccessToken(apiKey)) {
    console.log("[WA CREDS] Resolved WhatsApp token", {
      businessId,
      businessName: business.name,
      tokenSource,
      phoneNumberId,
      length: apiKey.length,
      prefix: apiKey.slice(0, 4),
    });
  }

  if (!apiKey || !phoneNumberId) {
    console.warn("[WA CREDS] Incomplete WhatsApp credentials", {
      businessId,
      businessName: business.name,
      hasPhoneNumberId: Boolean(phoneNumberId),
      hasApiKey: Boolean(apiKey),
      tokenSource,
      hint: "Paste a Meta access token (starts with EAA…) into Businesses → Access token",
    });
  }

  return { phoneNumberId, businessAccountId, apiKey, verifyToken, integrationId: null };
}

/**
 * A business shaped for the client: the encrypted access token is never sent —
 * only a boolean flag saying whether one is configured. Everything else is safe
 * to expose to any member of the owning tenant.
 */
export function publicBusiness(b: Business) {
  const { whatsappAccessToken, whatsappVerifyToken, whatsappAppSecret, ...rest } = b;
  return {
    ...rest,
    hasWhatsappToken: Boolean(whatsappAccessToken),
    hasWhatsappVerifyToken: Boolean(whatsappVerifyToken),
    hasWhatsappAppSecret: Boolean(whatsappAppSecret),
  };
}
