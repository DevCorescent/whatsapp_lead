// ============================================================================
// MODULE : Public projection of TenantSettings
// ============================================================================
//
// TenantSettings holds four secrets alongside ordinary configuration: the WhatsApp
// access token, the WhatsApp App Secret, the webhook verify token and the SMTP
// password. GET /api/settings used to answer `{ ...settings }`, which published all
// four to the browser — and because `encryptSecret` stores plaintext when
// ENCRYPTION_KEY is unset, on such a deployment those were usable credentials, not
// ciphertext.
//
// The projection lives here rather than inline in the route for one reason: a
// security rule that cannot be unit-tested is a rule nobody re-checks after the next
// column is added. tests/settings-secret-exposure.test.ts asserts that no value from
// a secret field can appear in this function's output.
//
// The rule is an allowlist. Fields are published because they are named below, not
// because they failed to match a blocklist — so a secret column added to the schema
// later is excluded by default until someone adds it here deliberately.

import type { TenantSettings } from "@prisma/client";

/**
 * The fields that must never reach a client, named once so the test can enumerate
 * them and so a reviewer can see the whole list without reading the projection.
 */
export const SECRET_SETTINGS_FIELDS = [
  "waApiKey",
  "waAppSecret",
  "waWebhookVerifyToken",
  "smtpPass",
] as const satisfies readonly (keyof TenantSettings)[];

/** The tenant identity the settings screen renders alongside the configuration. */
export interface PublicTenant {
  name: string;
  slug: string;
  logo: string | null;
  domain: string | null;
}

/**
 * Shape TenantSettings for the browser.
 *
 * Every secret becomes a `has*` boolean: enough for a screen to render "configured"
 * or "not configured", and useless to anyone who intercepts the response.
 *
 * @param settings - The row as stored, secrets included.
 * @param tenant - Tenant identity, or null when it could not be loaded.
 */
export function publicTenantSettings(
  settings: TenantSettings,
  tenant: PublicTenant | null,
) {
  return {
    tenant,

    id: settings.id,
    tenantId: settings.tenantId,

    // Identifiers, not credentials: a Phone Number ID and a WABA ID are visible to
    // anyone the business messages, and the screens show them for support.
    waPhoneNumberId: settings.waPhoneNumberId,
    waBusinessAccountId: settings.waBusinessAccountId,

    aiEnabled: settings.aiEnabled,
    aiModel: settings.aiModel,
    autoReply: settings.autoReply,
    autoReplyDelay: settings.autoReplyDelay,
    aiPersonality: settings.aiPersonality,

    timezone: settings.timezone,
    businessHoursStart: settings.businessHoursStart,
    businessHoursEnd: settings.businessHoursEnd,
    businessDays: settings.businessDays,
    offHoursMessage: settings.offHoursMessage,

    // Where mail goes is configuration; only the password is a secret.
    smtpHost: settings.smtpHost,
    smtpPort: settings.smtpPort,
    smtpUser: settings.smtpUser,
    smtpFrom: settings.smtpFrom,

    onboardingCompleted: settings.onboardingCompleted,
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,

    hasWaApiKey: Boolean(settings.waApiKey),
    hasWaAppSecret: Boolean(settings.waAppSecret),
    hasWaWebhookVerifyToken: Boolean(settings.waWebhookVerifyToken),
    hasSmtpPass: Boolean(settings.smtpPass),
  };
}
