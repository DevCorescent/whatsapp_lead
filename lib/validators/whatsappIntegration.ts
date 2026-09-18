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
  /** Single-use authorization code from the Facebook Login for Business callback. */
  code: z
    .string()
    .trim()
    .min(10, "Missing the authorization code from Meta")
    .max(2000, "Authorization code is not in the expected format"),
  /** WABA the customer selected. Verified against the token's granular scopes before use. */
  wabaId: metaId.optional(),
  /** Phone number the customer onboarded. Verified against the WABA's number list before use. */
  phoneNumberId: metaId.optional(),
  /** Business to connect. Defaults to the caller's current business; always ownership-checked. */
  businessId: z.string().trim().min(1).max(64).optional(),
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
