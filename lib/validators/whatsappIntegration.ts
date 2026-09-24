import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Validation for the WhatsApp Embedded Signup endpoints.
//
// Every field here originates in the browser, so the schemas are deliberately
// narrow: Meta's ids are numeric strings and its authorization code is an opaque
// token, and nothing longer or stranger than that has any business reaching a
// Graph API call. Shape validation is the first of two gates — the second, in the
// connect route, checks the ids against what Meta itself says the token can reach.
// ─────────────────────────────────────────────────────────────────────────────

/** Meta object ids are numeric strings; length is bounded well above what Meta issues. */
const metaId = z.string().trim().regex(/^\d{5,32}$/, "Not a valid Meta ID");

export const connectWhatsAppSchema = z.object({
  /**
   * Authorization code from the Facebook Login for Business JS SDK callback
   * (response_type:"code"). Exchanged server-side for a business access token.
   */
  token: z
    .string()
    .trim()
    .min(10, "Missing the access token from Meta")
    .max(2000, "Access token is not in the expected format"),
  /** WABA the customer selected. Verified against the token's granular scopes before use. */
  wabaId: metaId.optional(),
  /** Phone number the customer onboarded. Verified against the WABA's number list before use. */
  phoneNumberId: metaId.optional(),
  /** Business to connect. Defaults to the caller's current business; always ownership-checked. */
  businessId: z.string().trim().min(1).max(64).optional(),
  /** The page URL (origin+pathname) from which FB.login was called; matched as redirect_uri. */
  redirectUri: z.string().url().max(512).optional(),
});

/** Our own row id (cuid). Always re-checked against the caller's tenant before use. */
const integrationId = z.string().trim().min(1).max(64);

export const disconnectWhatsAppSchema = z.object({
  /** The number to disconnect. Required once a business has any connected number. */
  integrationId: integrationId.optional(),
  /** Legacy: disconnect a business that only has hand-entered credentials. */
  businessId: z.string().trim().min(1).max(64).optional(),
});

export const testWhatsAppSchema = z.object({
  /** The number to test. Without it, the business's default sender is tested. */
  integrationId: integrationId.optional(),
  businessId: z.string().trim().min(1).max(64).optional(),
});

export type ConnectWhatsAppInput = z.infer<typeof connectWhatsAppSchema>;

/**
 * What a PATCH to /api/integrations/whatsapp/[id] may change.
 *
 * Strict on purpose. The rejected fields are the point of this schema:
 *
 *   phoneNumberId, whatsappBusinessId — Meta's identity for the connection.
 *     Editing them by hand would point the row at an account this workspace never
 *     authorised while the stored token still belongs to the old one.
 *   accessToken, verifyToken, appSecret — secrets. They never reach the browser
 *     and cannot be set from it; they change only by reconnecting.
 *   tenantId, businessId — ownership. Always derived from the session.
 *   isActive — disconnecting wipes the token, so "reactivating" a row would
 *     advertise a number that cannot send. Use connect/disconnect instead.
 */
export const updateWhatsAppIntegrationSchema = z
  .object({
    displayName: z.string().trim().min(1, "Give the number a name").max(80).optional(),
    /** Only ever true: a default is moved by promoting another number, not cleared. */
    isDefault: z.literal(true).optional(),
  })
  .strict()
  .refine((v) => v.displayName !== undefined || v.isDefault !== undefined, {
    message: "Nothing to update",
  });
