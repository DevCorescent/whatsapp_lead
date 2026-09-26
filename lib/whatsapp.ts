// TODO [GAURANSH]: WhatsApp Cloud API client.
//
// Functions to implement:
//   sendTextMessage(phoneNumberId, apiKey, to, body)
//   sendTemplateMessage(phoneNumberId, apiKey, to, templateName, language, components)
//   sendMediaMessage(phoneNumberId, apiKey, to, type, mediaId, caption?)
//   sendInteractiveMessage(phoneNumberId, apiKey, to, interactive)
//   markMessageAsRead(phoneNumberId, apiKey, messageId)
//   uploadMedia(phoneNumberId, apiKey, file, mimeType)
//   getMediaUrl(mediaId, apiKey)
//
// Base URL: https://graph.facebook.com/v19.0
// All requests need: Authorization: Bearer {apiKey}

const WA_BASE_URL = `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION ?? "v19.0"}`;

/**
 * Thrown when Meta's Cloud API rejects a send (text or interactive).
 * `.message` is already user-friendly — safe to return directly to the client.
 */
export class WASendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WASendError";
  }
}

/** Digits-only E.164 without '+'. Meta accepts this form for Cloud API `to`. */
function normalizeWaTo(to: string): string {
  return to.replace(/\D/g, "");
}

/**
 * Strip characters that make Meta return opaque 400s while agent-typed messages still work.
 * Manual inbox sends are short plain text; model output often includes nulls, unpaired
 * surrogates, or markdown fences that Cloud API rejects.
 */
export function sanitizeWaText(raw: string): string {
  return raw
    .replace(/\u0000/g, "")
    .replace(/[\uD800-\uDFFF]/g, "") // unpaired surrogates
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, 4096);
}

function formatMetaSendError(status: number, statusText: string, to: string, raw: string): string {
  let hint = "";
  let summary = raw;

  try {
    const parsed = JSON.parse(raw) as {
      error?: {
        message?: string;
        code?: number;
        error_subcode?: number;
        error_data?: { details?: string };
        type?: string;
      };
    };
    const e = parsed.error;
    if (e) {
      summary = [
        e.message,
        e.code != null ? `code=${e.code}` : null,
        e.error_subcode != null ? `subcode=${e.error_subcode}` : null,
        e.error_data?.details ? `details=${e.error_data.details}` : null,
      ]
        .filter(Boolean)
        .join(" | ");

      // Common Cloud API failures — surface a fix instead of a opaque 400.
      if (e.code === 190 || status === 401) {
        hint =
          " — Access token invalid. Paste a fresh EAA… token from Meta → WhatsApp → API Setup into Businesses (same workspace that owns this number).";
      } else if (e.code === 100) {
        hint =
          " — Invalid parameter (often wrong Phone Number ID for this token, or bad recipient). Confirm Phone Number ID matches the token's WhatsApp account.";
      } else if (e.code === 131030) {
        hint =
          " — Recipient not in the allowed list. In Meta → WhatsApp → API Setup, add this customer number under 'To' test numbers (or go live).";
      } else if (e.code === 131047 || e.error_subcode === 131047) {
        hint =
          " — Outside the 24-hour customer care window. Customer must message you first, or send an approved template.";
      } else if (e.code === 131026) {
        hint = " — Message undeliverable (invalid/blocked WhatsApp number).";
      } else if (status === 400) {
        hint =
          " — Meta rejected the send. Check Phone Number ID + token pair, and that this number can message the recipient.";
      }
    }
  } catch {
    // Non-JSON body (HTML gateway error) — keep raw text.
  }

  return `WhatsApp API error (${status} ${statusText}) sending text to ${to}: ${summary}${hint}`;
}

function userFriendlyWASendError(code: number | undefined, status: number): string {
  if (code === 190 || status === 401) {
    return "WhatsApp session has expired. Please go to Settings → WhatsApp and reconnect your account.";
  }
  if (code === 100) {
    return "WhatsApp configuration error. Please check your Phone Number ID in Settings → WhatsApp.";
  }
  if (code === 131030) {
    return "This number is not in your WhatsApp test list. Add it under Meta → WhatsApp → API Setup → 'To' numbers, or switch your account to live mode.";
  }
  if (code === 131047) {
    return "The 24-hour reply window has closed. Ask the customer to message you first, or send an approved template instead.";
  }
  if (code === 131026) {
    return "This number cannot receive WhatsApp messages. It may not be registered on WhatsApp or has blocked messages.";
  }
  if (status === 400) {
    return "WhatsApp rejected the message. Please check your connection settings in Settings → WhatsApp.";
  }
  return "Message failed to send. Please try again, or check your WhatsApp connection in Settings.";
}

export async function sendTextMessage(
  phoneNumberId: string,
  apiKey: string,
  to: string,
  body: string,
  contextMessageId?: string
) {
  const recipient = normalizeWaTo(to);
  if (!recipient) {
    throw new Error(`WhatsApp send aborted — empty recipient (raw="${to}")`);
  }
  if (!body.trim()) {
    throw new Error("WhatsApp send aborted — empty message body");
  }

  const text = sanitizeWaText(body);
  if (!text) {
    throw new Error("WhatsApp send aborted — message empty after sanitize");
  }

  const res = await fetch(`${WA_BASE_URL}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient,
      type: "text",
      text: { preview_url: false, body: text },
      ...(contextMessageId ? { context: { message_id: contextMessageId } } : {}),
    }),
  });

  if (!res.ok) {
    // Meta returns JSON on error but emits HTML on gateway failures (502/504). Calling res.json()
    // here would throw a SyntaxError *inside the error handler*, destroying the real failure and
    // replacing it with a parse error — precisely when the real failure matters most.
    const err = await res.text();
    let errorCode: number | undefined;
    try { errorCode = (JSON.parse(err) as { error?: { code?: number } })?.error?.code; } catch { /* non-JSON */ }
    console.error("[WA SEND] Meta rejected text message", {
      status: res.status,
      phoneNumberId,
      to: recipient,
      bodyLength: text.length,
      bodyPreview: text.slice(0, 120),
      meta: err.slice(0, 800),
      tech: formatMetaSendError(res.status, res.statusText, recipient, err),
    });
    throw new WASendError(userFriendlyWASendError(errorCode, res.status));
  }

  return res.json() as Promise<WASendMessageResponse>;
}

// ─── Template message types (Meta Cloud API) ─────────────────────────────────

export type WATemplateParameter =
  | { type: "text"; text: string; parameter_name?: string }
  | { type: "image"; image: { link: string } | { id: string } }
  | { type: "video"; video: { link: string } | { id: string } }
  | { type: "document"; document: { link: string; filename?: string } | { id: string } }
  | { type: "payload"; payload: string }
  | {
      type: "currency";
      currency: { fallback_value: string; code: string; amount_1000: number };
    }
  | { type: "date_time"; date_time: { fallback_value: string } };

export interface WATemplateComponent {
  type: "header" | "body" | "button";
  /** Required when type is "button" */
  sub_type?: "quick_reply" | "url" | "copy_code";
  /** Zero-based button position, as a string. Required when type is "button" */
  index?: string;
  parameters?: WATemplateParameter[];
}

export interface WASendMessageResponse {
  messaging_product: "whatsapp";
  contacts: { input: string; wa_id: string }[];
  messages: { id: string; message_status?: string }[];
}

export async function sendTemplateMessage(
  phoneNumberId: string,
  apiKey: string,
  to: string,
  templateName: string,
  language: string,
  components?: WATemplateComponent[]
): Promise<WASendMessageResponse> {
  const recipient = normalizeWaTo(to);
  if (!recipient) {
    throw new Error(`WhatsApp template send aborted — empty recipient (raw="${to}")`);
  }

  const res = await fetch(`${WA_BASE_URL}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient,
      type: "template",
      template: {
        name: templateName,
        language: { code: language },
        ...(components?.length ? { components } : {}),
      },
    }),
  });

  if (!res.ok) {
    // Meta returns JSON on error, but can emit HTML on gateway failures —
    // read as text so the error path never throws over the real error.
    const err = await res.text();
    console.error("[WA SEND] Meta rejected template message", {
      status: res.status,
      phoneNumberId,
      to: recipient,
      templateName,
      language,
      componentCount: components?.length ?? 0,
      meta: err.slice(0, 800),
    });
    throw new Error(
      `WhatsApp API error (${res.status} ${res.statusText}) sending template "${templateName}" [${language}] to ${recipient}: ${err}`
    );
  }

  console.log("[WA SEND] Template accepted", {
    phoneNumberId,
    to: recipient,
    templateName,
    language,
  });

  return res.json() as Promise<WASendMessageResponse>;
}

/** Media types supported by the WhatsApp Cloud API media message endpoint. */
export type WAMediaType = "image" | "video" | "audio" | "document";

/**
 * Send a media message (image, video, audio or document) via the WhatsApp Cloud API.
 *
 * The media must already be hosted on Meta's servers — pass the media ID returned by
 * `uploadMedia()` or received on an inbound webhook message, not a public URL.
 *
 * @param phoneNumberId - The tenant's WhatsApp phone number ID (TenantSettings.waPhoneNumberId).
 * @param apiKey - The tenant's WhatsApp access token (TenantSettings.waApiKey).
 * @param to - Recipient in E.164 format without a leading "+", e.g. "919876543210".
 * @param type - One of "image" | "video" | "audio" | "document".
 * @param mediaId - Meta media ID for the asset to send.
 * @param caption - Optional caption. Ignored for "audio", which Meta does not allow captions on.
 * @returns The Meta send response, including the assigned `messages[0].id` (the `waMessageId`).
 * @throws {Error} If Meta responds with a non-2xx status; the message includes the status and response body.
 */
export async function sendMediaMessage(
  phoneNumberId: string,
  apiKey: string,
  to: string,
  type: WAMediaType,
  mediaId: string,
  caption?: string
): Promise<WASendMessageResponse> {
  const res = await fetch(`${WA_BASE_URL}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type,
      // Meta keys the media object by the message type, e.g. { type: "image", image: {...} }.
      // Captions are valid on image/video/document only — Meta rejects them on audio.
      [type]: {
        id: mediaId,
        ...(caption && type !== "audio" ? { caption } : {}),
      },
    }),
  });

  if (!res.ok) {
    // Meta returns JSON on error, but can emit HTML on gateway failures —
    // read as text so the error path never throws over the real error.
    const err = await res.text();
    throw new Error(
      `WhatsApp API error (${res.status} ${res.statusText}) sending ${type} media "${mediaId}" to ${to}: ${err}`
    );
  }

  return res.json() as Promise<WASendMessageResponse>;
}

/** Metadata returned by the WhatsApp Cloud API for a stored media asset. */
export interface WAMediaResponse {
  url: string;
  mime_type: string;
  sha256: string;
  file_size: number;
  id: string;
}

/**
 * Retrieve metadata and a temporary download URL for a media asset stored on Meta's servers.
 *
 * Call this with the media ID from an inbound webhook message (e.g. `WAMessage.image.id`)
 * before persisting or re-hosting the asset.
 *
 * Two Meta constraints the caller must handle:
 * 1. The returned `url` is short-lived (expires roughly 5 minutes after this call), so fetch
 *    it immediately rather than persisting it to `Message.mediaUrl` as a durable link.
 * 2. The `url` is NOT publicly accessible — downloading it still requires the same
 *    `Authorization: Bearer {apiKey}` header. It cannot be handed to a browser or an <img> tag.
 *
 * This function only returns the metadata; it does not download the file.
 *
 * @param mediaId - Meta media ID, from an inbound webhook message or `uploadMedia()`.
 * @param apiKey - The tenant's WhatsApp access token (TenantSettings.waApiKey).
 * @returns The media metadata and its temporary, authenticated download URL.
 * @throws {Error} If Meta responds with a non-2xx status; the message includes the status and response body.
 */
export async function getMediaUrl(
  mediaId: string,
  apiKey: string
): Promise<WAMediaResponse> {
  const res = await fetch(`${WA_BASE_URL}/${mediaId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!res.ok) {
    // Meta returns JSON on error, but can emit HTML on gateway failures —
    // read as text so the error path never throws over the real error.
    const err = await res.text();
    throw new Error(
      `WhatsApp API error (${res.status} ${res.statusText}) fetching media "${mediaId}": ${err}`
    );
  }

  return res.json() as Promise<WAMediaResponse>;
}

/** Response returned by the WhatsApp Cloud API media upload endpoint. */
export interface WAMediaUploadResponse {
  id: string;
}

/**
 * Upload a media asset to Meta's servers and return its media ID.
 *
 * Outbound media must live on Meta's servers before it can be sent — upload here, then pass
 * the returned `id` to `sendMediaMessage()`. Uploaded assets are retained by Meta for 30 days.
 *
 * Meta enforces per-type size caps (roughly: image 5MB, document/video 16MB, audio 16MB) and
 * a MIME allowlist; violations surface as a thrown error from this call, not a silent truncation.
 *
 * @param phoneNumberId - The tenant's WhatsApp phone number ID (TenantSettings.waPhoneNumberId).
 * @param apiKey - The tenant's WhatsApp access token (TenantSettings.waApiKey).
 * @param file - The asset to upload. A `File` from `request.formData()`, or any `Blob`.
 * @param mimeType - MIME type to declare to Meta, e.g. "image/jpeg", "application/pdf".
 * @returns The uploaded asset's media ID, for use with `sendMediaMessage()`.
 * @throws {Error} If Meta responds with a non-2xx status; the message includes the status and response body.
 */
export async function uploadMedia(
  phoneNumberId: string,
  apiKey: string,
  file: Blob,
  mimeType: string
): Promise<WAMediaUploadResponse> {
  // Meta reads the MIME type from the multipart part, so re-wrap when the caller's
  // declared mimeType disagrees with the Blob's own type (or the Blob has none).
  const upload = file.type === mimeType ? file : new Blob([file], { type: mimeType });
  const filename =
    file instanceof File ? file.name : `upload.${mimeType.split("/")[1] ?? "bin"}`;

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  form.append("file", upload, filename);

  const res = await fetch(`${WA_BASE_URL}/${phoneNumberId}/media`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      // No Content-Type here on purpose — fetch must set it itself so that the
      // multipart boundary is generated. Setting it manually breaks the upload.
    },
    body: form,
  });

  if (!res.ok) {
    // Meta returns JSON on error, but can emit HTML on gateway failures —
    // read as text so the error path never throws over the real error.
    const err = await res.text();
    throw new Error(
      `WhatsApp API error (${res.status} ${res.statusText}) uploading ${mimeType} media (${file.size} bytes): ${err}`
    );
  }

  return res.json() as Promise<WAMediaUploadResponse>;
}

/**
 * Send an interactive message (reply buttons, list, CTA URL, flow, product) via the
 * WhatsApp Cloud API.
 *
 * The `interactive` object is forwarded to Meta verbatim. This helper performs no validation —
 * the caller is responsible for supplying a payload that matches Meta's schema for the
 * `interactive.type` it is using, e.g.:
 *
 *   { type: "button", body: { text }, action: { buttons: [...] } }
 *   { type: "list", body: { text }, action: { button, sections: [...] } }
 *
 * A recipient's tap on a button or list row arrives back on the webhook as an inbound message
 * with `WAMessage.interactive.button_reply` / `list_reply`.
 *
 * @param phoneNumberId - The tenant's WhatsApp phone number ID (TenantSettings.waPhoneNumberId).
 * @param apiKey - The tenant's WhatsApp access token (TenantSettings.waApiKey).
 * @param to - Recipient in E.164 format without a leading "+", e.g. "919876543210".
 * @param interactive - The interactive payload, passed through to Meta unmodified.
 * @returns The Meta send response, including the assigned `messages[0].id` (the `waMessageId`).
 * @throws {Error} If Meta responds with a non-2xx status; the message includes the status and response body.
 */
export async function sendInteractiveMessage(
  phoneNumberId: string,
  apiKey: string,
  to: string,
  interactive: Record<string, unknown>,
  contextMessageId?: string
): Promise<WASendMessageResponse> {
  const res = await fetch(`${WA_BASE_URL}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive,
      ...(contextMessageId ? { context: { message_id: contextMessageId } } : {}),
    }),
  });

  if (!res.ok) {
    // Meta returns JSON on error, but can emit HTML on gateway failures —
    // read as text so the error path never throws over the real error.
    const err = await res.text();
    let errorCode: number | undefined;
    try { errorCode = (JSON.parse(err) as { error?: { code?: number } })?.error?.code; } catch { /* non-JSON */ }
    console.error("[WA SEND] Meta rejected interactive message", {
      status: res.status,
      phoneNumberId,
      to,
      meta: err.slice(0, 800),
    });
    throw new WASendError(userFriendlyWASendError(errorCode, res.status));
  }

  return res.json() as Promise<WASendMessageResponse>;
}

export async function markMessageAsRead(
  phoneNumberId: string,
  apiKey: string,
  messageId: string
) {
  await fetch(`${WA_BASE_URL}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    }),
  });
}

// ─── Template management (Meta Graph API) ────────────────────────────────────

export interface WATemplateCreateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  text?: string;
  add_security_recommendation?: boolean;
  code_expiration_minutes?: number;
  example?: {
    header_handle?: string[];
    header_text?: string[];
    body_text?: string[][];
    body_text_named_params?: Array<{ param_name: string; example: string }>;
  };
  buttons?: Array<{
    type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "OTP" | "COPY_CODE" | "VOICE_CALL";
    text?: string;
    url?: string;
    phone_number?: string;
    example?: string[];
    otp_type?: "COPY_CODE" | "ONE_TAP";
  }>;
}

interface WATemplateCreateResponse {
  id: string;
  status: string;
  category: string;
}

/** Thrown by createMessageTemplate when Meta returns a non-2xx — carries the full Meta error object. */
export class MetaTemplateError extends Error {
  constructor(
    readonly metaMessage: string,
    readonly code: number | undefined,
    readonly subcode: number | undefined,
    readonly details: string | undefined,
    readonly fbtrace_id: string | undefined,
    readonly httpStatus: number,
  ) {
    const full = details ? `${metaMessage} — ${details}` : metaMessage;
    super(full);
    this.name = "MetaTemplateError";
  }
}

export async function createMessageTemplate(
  businessAccountId: string,
  apiKey: string,
  payload: {
    name: string;
    language: string;
    category: string;
    components: WATemplateCreateComponent[];
    parameter_format?: "named";
    allow_category_change?: boolean;
  }
): Promise<WATemplateCreateResponse> {
  // Always send allow_category_change: true so Meta auto-corrects the category rather than
  // rejecting with code 100 / subcode 2388299 when its classifier disagrees with ours.
  const body = { allow_category_change: true, ...payload };
  console.log("[WA TEMPLATE CREATE] submitting to Meta:", JSON.stringify(body, null, 2));

  const res = await fetch(
    `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION ?? "v19.0"}/${businessAccountId}/message_templates`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = body as {
      error?: {
        message?: string;
        code?: number;
        error_subcode?: number;
        error_data?: { details?: string; messaging_product?: string };
        fbtrace_id?: string;
      };
    };
    const metaMessage = err.error?.message ?? "Failed to create template";
    const details = err.error?.error_data?.details;
    console.error("[WA TEMPLATE CREATE] Meta rejected:", {
      status: res.status,
      code: err.error?.code,
      subcode: err.error?.error_subcode,
      message: metaMessage,
      details,
      fbtrace_id: err.error?.fbtrace_id,
    });
    throw new MetaTemplateError(
      metaMessage,
      err.error?.code,
      err.error?.error_subcode,
      details,
      err.error?.fbtrace_id,
      res.status,
    );
  }
  return res.json() as Promise<WATemplateCreateResponse>;
}

/** One template record as Meta returns it from GET /{waba-id}/message_templates. */
export interface WATemplateListItem {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  rejection_reason?: string;
  /** "named" when the template uses {{snake_case}} params, "positional" (default) for {{1}}, {{2}}. */
  parameter_format?: "named" | "positional";
  components?: Array<{
    type: string;
    format?: string;
    text?: string;
    buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
  }>;
}

/**
 * Fetch all message templates registered on a WABA from Meta.
 *
 * Paginates automatically up to `limit` items (Meta sends 20 per page by default).
 * Used by the import flow to pull in templates that were created in Meta's console.
 */
export async function listMessageTemplates(
  businessAccountId: string,
  apiKey: string,
  limit = 200,
): Promise<WATemplateListItem[]> {
  const GRAPH = `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION ?? "v19.0"}`;
  const results: WATemplateListItem[] = [];
  let url: string | null =
    `${GRAPH}/${businessAccountId}/message_templates?fields=id,name,status,category,language,rejection_reason,parameter_format,components&limit=20`;

  while (url && results.length < limit) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        (body as { error?: { message?: string } }).error?.message ?? "Failed to list templates",
      );
    }
    const page = (await res.json()) as { data?: WATemplateListItem[]; paging?: { next?: string } };
    results.push(...(page.data ?? []));
    url = page.paging?.next ?? null;
  }

  return results.slice(0, limit);
}

export async function getMessageTemplate(
  businessAccountId: string,
  apiKey: string,
  waTemplateId: string
): Promise<{ id: string; name: string; status: string; rejection_reason?: string } | null> {
  const res = await fetch(
    `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION ?? "v19.0"}/${waTemplateId}?fields=id,name,status,rejection_reason`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  if (res.status === 404) return null; // template deleted from Meta
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: { message?: string } }).error?.message ?? "Failed to fetch template");
  }
  void businessAccountId;
  return res.json();
}

// ─── Phone number details (Meta Graph API) ───────────────────────────────────

/** Fields Meta returns for a WhatsApp business phone number. All are optional per Meta. */
export interface WAPhoneNumberDetails {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  code_verification_status?: string;
}

/**
 * A non-2xx answer from Meta, carrying Meta's own `error.message` separately from the
 * transport failure that never reached Meta at all.
 *
 * The distinction is what lets a caller answer 400 ("Meta rejected these credentials,
 * here is why") rather than 502 ("we could not reach Meta") — collapsing the two is how
 * an expired token ends up reported to the operator as an outage.
 */
export class MetaApiError extends Error {
  constructor(
    /** HTTP status Meta answered with. */
    readonly status: number,
    /** Meta's `error.message`, already extracted — safe to show the operator. */
    readonly metaMessage: string,
    /** Meta's numeric `error.code`, when the body carried one. */
    readonly code?: number,
  ) {
    super(metaMessage);
    this.name = "MetaApiError";
  }
}

/**
 * Fetch a phone number's metadata from the Graph API — the single Graph call that every
 * "Test Connection" in the app is built on.
 *
 * It exists as one function because the same request is made from the tenant settings test,
 * the per-business test and the connect flow's post-onboarding verification; three copies of
 * it would be three places for the field list and the error mapping to drift apart.
 *
 * The token travels in the Authorization header, never the query string: Meta accepts either,
 * but a URL is the one part of a request that platforms routinely write to access logs.
 *
 * @param phoneNumberId - Meta phone_number_id to inspect.
 * @param apiKey - A decrypted access token with access to that number.
 * @throws {MetaApiError} When Meta answers non-2xx. Transport failures reject with the
 *   original fetch error, so the caller can tell "rejected" from "unreachable".
 */
export async function getPhoneNumberDetails(
  phoneNumberId: string,
  apiKey: string,
): Promise<WAPhoneNumberDetails> {
  const res = await fetch(
    `${WA_BASE_URL}/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );

  // Meta returns JSON on success and on most errors, but emits HTML on gateway failures —
  // read as text so the error path never throws a SyntaxError over the real error.
  const rawText = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
  } catch {
    parsed = {};
  }

  if (!res.ok) {
    const metaError = parsed.error as { message?: string; code?: number } | undefined;
    throw new MetaApiError(
      res.status,
      metaError?.message ?? `Meta returned ${res.status} ${res.statusText}`,
      metaError?.code,
    );
  }

  return parsed as WAPhoneNumberDetails;
}
