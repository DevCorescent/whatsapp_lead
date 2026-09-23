// ============================================================================
// MODULE : WhatsApp Embedded Signup (Meta official onboarding)
// ============================================================================
//
// Server side of Meta's WhatsApp Embedded Signup — the official flow that replaces
// asking a customer to copy a Phone Number ID, a WABA ID and an access token out of
// Meta's console by hand.
//
// What Meta's documentation actually specifies (developers.facebook.com/docs/whatsapp/
// embedded-signup), and therefore what this module implements:
//
//   1. The browser runs Facebook Login for Business with our `config_id`. On success the
//      customer has created or selected a business portfolio and a WABA, verified a phone
//      number, and granted our app access to those assets.
//   2. Two things come back, on two different channels: `waba_id` / `phone_number_id` on a
//      `postMessage`, and a single-use authorization `code` on the FB.login callback. The
//      code has a time-to-live of THIRTY SECONDS, which is why the exchange happens here,
//      in one request, rather than being deferred to a background job.
//   3. GET /oauth/access_token exchanges that code for a customer-scoped "business token".
//   4. GET /debug_token names, in `granular_scopes[].target_ids`, exactly which WABAs that
//      token was granted for.
//   5. POST /<WABA_ID>/subscribed_apps points the customer's WABA at our webhook.
//   6. POST /<PHONE_NUMBER_ID>/register enables the number for Cloud API sending.
//
// Two boundaries this module exists to hold:
//
//   Nothing the browser says is trusted. The `waba_id` and `phone_number_id` that arrive
//   from the client are treated as hints to be confirmed — the WABA against the token's own
//   granular scopes, the phone number against that WABA's number list. A caller who posts
//   someone else's ids gets them rejected rather than written to their business.
//
//   Nothing secret is logged or returned. The app secret and the business token never leave
//   this file's arguments, never enter a URL that could be written to an access log, and
//   never appear in a thrown message. Errors carry Meta's own operator-facing text only.

import { MetaApiError } from "@/lib/whatsapp";

/** Graph API version for every call in this module — same env var the rest of the app uses. */
const GRAPH_VERSION = process.env.WHATSAPP_API_VERSION ?? "v19.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/**
 * Non-secret Embedded Signup configuration, safe to hand to the browser.
 *
 * `appId` and `configId` are public by construction — the Facebook JS SDK puts both in the
 * page in order to work at all. The app *secret* is deliberately absent and must never be
 * added here: it is what lets this server exchange a code, and a browser that has it can
 * mint customer tokens.
 */
export interface EmbeddedSignupConfig {
  appId: string;
  configId: string;
  graphVersion: string;
}

/**
 * Read the Embedded Signup configuration from the environment.
 *
 * Returns null when the deployment has not been set up, rather than throwing: an unconfigured
 * instance should show the operator what is missing and keep manual credential entry working,
 * not fail the settings page.
 */
export function readEmbeddedSignupConfig(): EmbeddedSignupConfig | null {
  const appId = process.env.WHATSAPP_APP_ID?.trim();
  const configId = process.env.WHATSAPP_ES_CONFIG_ID?.trim();
  if (!appId || !configId) return null;
  return { appId, configId, graphVersion: GRAPH_VERSION };
}

/** Which of the server-side variables are missing, for an operator-facing message. */
export function missingEmbeddedSignupEnv(): string[] {
  return (
    [
      ["WHATSAPP_APP_ID", process.env.WHATSAPP_APP_ID],
      ["WHATSAPP_APP_SECRET", process.env.WHATSAPP_APP_SECRET],
      ["WHATSAPP_ES_CONFIG_ID", process.env.WHATSAPP_ES_CONFIG_ID],
    ] as const
  )
    .filter(([, value]) => !value?.trim())
    .map(([name]) => name);
}

/**
 * Parse a Graph response body without ever letting the parse itself become the error.
 *
 * Meta answers JSON for success and for almost every error, but emits HTML from its gateway
 * on 5xx. `res.json()` on that path throws a SyntaxError *inside* the error handler and
 * replaces the real failure with a parse error, so the body is read as text and parsed
 * defensively — the same discipline the rest of lib/whatsapp.ts uses.
 */
async function readGraphJson(res: Response): Promise<Record<string, unknown>> {
  const raw = await res.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Turn a non-2xx Graph response into a MetaApiError carrying Meta's own message. */
function graphError(res: Response, body: Record<string, unknown>): MetaApiError {
  const err = body.error as { message?: string; code?: number } | undefined;
  return new MetaApiError(
    res.status,
    err?.message ?? `Meta returned ${res.status} ${res.statusText}`,
    err?.code,
  );
}

/**
 * Exchange the single-use Embedded Signup code for a customer-scoped business token.
 *
 * Documented as `GET /oauth/access_token?client_id&client_secret&code`. The code expires
 * thirty seconds after Meta issues it, so a caller that queues this call will reliably see
 * it fail in production and only rarely in testing.
 *
 * The returned token is a Business Integration System User access token: it is scoped to the
 * WABAs this one customer just granted, and it is the value that gets encrypted and stored
 * against their Business row.
 *
 * @throws {MetaApiError} When Meta rejects the exchange — an expired or replayed code is the
 *   usual cause, and Meta's message says so.
 */
export async function exchangeCodeForBusinessToken(code: string): Promise<string> {
  const appId = process.env.WHATSAPP_APP_ID?.trim();
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    throw new Error("Embedded Signup is not configured on this deployment");
  }

  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    code,
  });

  // Meta documents this as a GET with query parameters. The URL therefore carries the app
  // secret, which is exactly why neither it nor any part of it is ever logged from here.
  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params.toString()}`, {
    method: "GET",
  });
  const body = await readGraphJson(res);

  if (!res.ok) throw graphError(res, body);

  const token = typeof body.access_token === "string" ? body.access_token.trim() : "";
  if (!token) {
    throw new MetaApiError(502, "Meta completed the exchange but returned no access token");
  }
  return token;
}

/** What `GET /debug_token` tells us about a business token. */
export interface DebuggedToken {
  isValid: boolean;
  /** WABA ids this token was granted `whatsapp_business_management` on, most recent first. */
  wabaIds: string[];
  /** Every granular scope name present on the token, for diagnostics. */
  scopes: string[];
  /** Unix seconds, or null for a token Meta reports as non-expiring. */
  expiresAt: number | null;
}

/**
 * Inspect a business token and learn which WABAs it is actually authorised for.
 *
 * This is the step that makes the client's claimed `waba_id` safe to use. Embedded Signup
 * reports the id over `postMessage`, which is to say: from the browser, where anything can be
 * substituted. `granular_scopes[].target_ids` is Meta's own statement of what the token can
 * reach, so the claim is checked against it rather than believed.
 *
 * Meta documents that the most recently onboarded WABA appears first in `target_ids`, which
 * is what makes the first entry a sound default when the client sent no id at all.
 *
 * Authenticated with the app access token (`<APP_ID>|<APP_SECRET>`) as the Graph API's
 * debug_token reference specifies — the token being inspected cannot vouch for itself.
 */
export async function debugBusinessToken(businessToken: string): Promise<DebuggedToken> {
  const appId = process.env.WHATSAPP_APP_ID?.trim();
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    throw new Error("Embedded Signup is not configured on this deployment");
  }

  const res = await fetch(
    `${GRAPH_BASE}/debug_token?input_token=${encodeURIComponent(businessToken)}`,
    { headers: { Authorization: `Bearer ${appId}|${appSecret}` } },
  );
  const body = await readGraphJson(res);

  if (!res.ok) throw graphError(res, body);

  const data = (body.data ?? {}) as {
    is_valid?: boolean;
    expires_at?: number;
    granular_scopes?: { scope?: string; target_ids?: string[] }[];
  };

  const granular = data.granular_scopes ?? [];

  return {
    isValid: data.is_valid === true,
    wabaIds: extractGrantedWabaIds(granular),
    scopes: granular.map((g) => g.scope).filter((s): s is string => Boolean(s)),
    expiresAt: data.expires_at && data.expires_at > 0 ? data.expires_at : null,
  };
}

/** A phone number as listed on a WABA. */
export interface WabaPhoneNumber {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  code_verification_status?: string;
}

/**
 * List the phone numbers attached to a WABA.
 *
 * Serves two purposes at once: it confirms the `phone_number_id` the browser reported really
 * belongs to the WABA the token is scoped to, and it supplies the human-readable display
 * number and verified name that the connected-account panel shows — values the customer never
 * has to type because Meta already knows them.
 */
export async function listWabaPhoneNumbers(
  wabaId: string,
  businessToken: string,
): Promise<WabaPhoneNumber[]> {
  const res = await fetch(
    `${GRAPH_BASE}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status`,
    { headers: { Authorization: `Bearer ${businessToken}` } },
  );
  const body = await readGraphJson(res);

  if (!res.ok) throw graphError(res, body);

  const data = Array.isArray(body.data) ? (body.data as WabaPhoneNumber[]) : [];
  return data.filter((p) => typeof p?.id === "string" && p.id.length > 0);
}

/** Display details for a WABA, used to label the connection in the UI. */
export interface WabaDetails {
  id: string;
  name?: string;
  timezone_id?: string;
  currency?: string;
}

/**
 * Fetch the WABA's own name. Best-effort by design: the connection is valid without it, so a
 * caller treats a failure as "no name to show" rather than as a failed onboarding.
 */
export async function getWabaDetails(
  wabaId: string,
  businessToken: string,
): Promise<WabaDetails | null> {
  try {
    const res = await fetch(`${GRAPH_BASE}/${wabaId}?fields=id,name,timezone_id,currency`, {
      headers: { Authorization: `Bearer ${businessToken}` },
    });
    const body = await readGraphJson(res);
    if (!res.ok) return null;
    return body as unknown as WabaDetails;
  } catch {
    return null;
  }
}

/**
 * Subscribe our app to the customer's WABA so their webhooks reach /api/webhook/whatsapp.
 *
 * Without this the credentials are perfectly valid for *sending* and completely silent for
 * *receiving* — which is the failure mode most likely to be mistaken for a working
 * connection. The caller reports a failure here to the operator rather than swallowing it.
 */
export async function subscribeAppToWaba(
  wabaId: string,
  businessToken: string,
): Promise<void> {
  const res = await fetch(`${GRAPH_BASE}/${wabaId}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${businessToken}` },
  });
  const body = await readGraphJson(res);
  if (!res.ok) throw graphError(res, body);
}

/** Remove our app's webhook subscription from a WABA, on disconnect. */
export async function unsubscribeAppFromWaba(
  wabaId: string,
  businessToken: string,
): Promise<void> {
  const res = await fetch(`${GRAPH_BASE}/${wabaId}/subscribed_apps`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${businessToken}` },
  });
  const body = await readGraphJson(res);
  if (!res.ok) throw graphError(res, body);
}

/**
 * Register the customer's phone number for Cloud API use.
 *
 * Meta requires a six-digit two-step-verification PIN. A number that is already registered —
 * or that already carries a PIN of its own from a previous setup — makes this call fail while
 * leaving a completely usable connection behind, so the caller treats the outcome as advisory
 * and surfaces it as a warning, never as a reason to discard the credentials.
 *
 * Skipped entirely when WHATSAPP_REGISTER_PIN is unset: inventing a PIN would set a
 * credential on the customer's number that nobody on either side knows.
 */
export async function registerPhoneNumber(
  phoneNumberId: string,
  businessToken: string,
): Promise<{ attempted: boolean; error?: string }> {
  const pin = process.env.WHATSAPP_REGISTER_PIN?.trim();
  if (!pin) return { attempted: false };

  try {
    const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}/register`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${businessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", pin }),
    });
    const body = await readGraphJson(res);
    if (!res.ok) return { attempted: true, error: graphError(res, body).metaMessage };
    return { attempted: true };
  } catch {
    return { attempted: true, error: "Could not reach Meta to register the number" };
  }
}

// ─── Trust decisions ─────────────────────────────────────────────────────────
//
// The two places where a value that came from the browser is either accepted or
// refused. They are pure functions, separate from the Graph calls, because these
// are the checks that stand between a valid session and writing another account's
// WhatsApp number onto this workspace — and a check that cannot be unit-tested is
// a check nobody re-verifies after the next refactor.

/** Outcome of choosing which WABA to connect. */
export type WabaSelection =
  | { ok: true; wabaId: string }
  | { ok: false; reason: "no-grants" | "not-granted" };

/**
 * Choose the WABA to connect, given what Meta says the token can reach.
 *
 * An id the browser claimed is honoured only when it appears in the token's granular
 * scopes. It is refused rather than replaced: silently connecting a different account
 * than the customer selected is a worse outcome than an error they can retry.
 *
 * With no claim, the first granted id is used — Meta documents the most recently
 * onboarded WABA as appearing first, which is the one the customer just finished.
 *
 * @param grantedWabaIds - `granular_scopes[].target_ids` from GET /debug_token.
 * @param claimed - The `waba_id` the browser reported, if any.
 */
export function selectWaba(grantedWabaIds: string[], claimed?: string): WabaSelection {
  if (grantedWabaIds.length === 0) return { ok: false, reason: "no-grants" };
  if (!claimed) return { ok: true, wabaId: grantedWabaIds[0] };
  if (!grantedWabaIds.includes(claimed)) return { ok: false, reason: "not-granted" };
  return { ok: true, wabaId: claimed };
}

/** Outcome of choosing which phone number to connect. */
export type PhoneSelection =
  | { ok: true; phone: WabaPhoneNumber }
  | { ok: false; reason: "none" | "not-on-waba" };

/**
 * Choose the phone number to connect from those actually listed on the granted WABA.
 *
 * Same rule as selectWaba: a claim from the browser must be present in Meta's own list,
 * and is refused when it is not. Passing the WABA check does not license an arbitrary
 * phone number id — a number can belong to a different WABA entirely.
 *
 * @param numbers - Result of GET /<WABA_ID>/phone_numbers.
 * @param claimed - The `phone_number_id` the browser reported, if any.
 */
export function selectPhoneNumber(
  numbers: WabaPhoneNumber[],
  claimed?: string,
): PhoneSelection {
  if (numbers.length === 0) return { ok: false, reason: "none" };
  if (!claimed) return { ok: true, phone: numbers[0] };
  const match = numbers.find((n) => n.id === claimed);
  if (!match) return { ok: false, reason: "not-on-waba" };
  return { ok: true, phone: match };
}

/**
 * Pull the granted WABA ids out of a `GET /debug_token` response body.
 *
 * Either WhatsApp scope proves the grant. A configuration that only requested messaging
 * still yields a usable WABA id, and requiring the management scope would refuse a
 * legitimate onboarding. Order is preserved so that Meta's "most recent first" guarantee
 * survives into selectWaba().
 */
export function extractGrantedWabaIds(
  granularScopes: { scope?: string; target_ids?: string[] }[] | undefined,
): string[] {
  const scopes = granularScopes ?? [];
  const management = scopes.find((g) => g.scope === "whatsapp_business_management");
  const messaging = scopes.find((g) => g.scope === "whatsapp_business_messaging");
  return Array.from(new Set([...(management?.target_ids ?? []), ...(messaging?.target_ids ?? [])]));
}
