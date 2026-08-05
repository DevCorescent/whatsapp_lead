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

export async function sendTextMessage(
  phoneNumberId: string,
  apiKey: string,
  to: string,
  body: string
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
    }),
  });

  if (!res.ok) {
    // Meta returns JSON on error but emits HTML on gateway failures (502/504). Calling res.json()
    // here would throw a SyntaxError *inside the error handler*, destroying the real failure and
    // replacing it with a parse error — precisely when the real failure matters most.
    const err = await res.text();
    console.error("[WA SEND] Meta rejected text message", {
      status: res.status,
      phoneNumberId,
      to: recipient,
      bodyLength: text.length,
      bodyPreview: text.slice(0, 120),
      meta: err.slice(0, 800),
    });
    throw new Error(formatMetaSendError(res.status, res.statusText, recipient, err));
  }

  return res.json() as Promise<WASendMessageResponse>;
}

// ─── Template message types (Meta Cloud API) ─────────────────────────────────

export type WATemplateParameter =
  | { type: "text"; text: string }
  | { type: "image"; image: { link: string } }
  | { type: "video"; video: { link: string } }
  | { type: "document"; document: { link: string; filename?: string } }
  | { type: "payload"; payload: string }
  | {
      type: "currency";
      currency: { fallback_value: string; code: string; amount_1000: number };
    }
  | { type: "date_time"; date_time: { fallback_value: string } };

export interface WATemplateComponent {
  type: "header" | "body" | "button";
  /** Required when type is "button" */
  sub_type?: "quick_reply" | "url";
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
    throw new Error(
      `WhatsApp API error (${res.status} ${res.statusText}) sending template "${templateName}" [${language}] to ${to}: ${err}`
    );
  }

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
  interactive: Record<string, unknown>
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
    }),
  });

  if (!res.ok) {
    // Meta returns JSON on error, but can emit HTML on gateway failures —
    // read as text so the error path never throws over the real error.
    const err = await res.text();
    throw new Error(
      `WhatsApp API error (${res.status} ${res.statusText}) sending interactive message to ${to}: ${err}`
    );
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
  example?: {
    header_handle?: string[];
    body_text?: string[][];
  };
  buttons?: Array<{
    type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
    text: string;
    url?: string;
    phone_number?: string;
  }>;
}

interface WATemplateCreateResponse {
  id: string;
  status: string;
  category: string;
}

export async function createMessageTemplate(
  businessAccountId: string,
  apiKey: string,
  payload: {
    name: string;
    language: string;
    category: string;
    components: WATemplateCreateComponent[];
  }
): Promise<WATemplateCreateResponse> {
  const res = await fetch(
    `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION ?? "v19.0"}/${businessAccountId}/message_templates`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: { message?: string } }).error?.message ?? "Failed to create template");
  }
  return res.json() as Promise<WATemplateCreateResponse>;
}

export async function getMessageTemplate(
  businessAccountId: string,
  apiKey: string,
  waTemplateId: string
): Promise<{ id: string; name: string; status: string; rejection_reason?: string }> {
  const res = await fetch(
    `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION ?? "v19.0"}/${waTemplateId}?fields=id,name,status,rejection_reason`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: { message?: string } }).error?.message ?? "Failed to fetch template");
  }
  void businessAccountId;
  return res.json();
}
