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

// TODO [GAURANSH]: Implement below

export async function sendTextMessage(
  phoneNumberId: string,
  apiKey: string,
  to: string,
  body: string
) {
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
      type: "text",
      text: { preview_url: false, body },
    }),
  });

  if (!res.ok) {
    // Meta returns JSON on error but emits HTML on gateway failures (502/504). Calling res.json()
    // here would throw a SyntaxError *inside the error handler*, destroying the real failure and
    // replacing it with a parse error — precisely when the real failure matters most.
    const err = await res.text();
    throw new Error(
      `WhatsApp API error (${res.status} ${res.statusText}) sending text to ${to}: ${err}`
    );
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

// ─── Message templates (Meta Cloud API) ─────────────────────────────────────
//
// Templates live on the WhatsApp Business Account (WABA), not the phone number,
// so these calls are keyed by the tenant's waBusinessAccountId — distinct from
// the phoneNumberId used to send messages.

/** A single component of a template as Meta's create endpoint expects it. */
export interface WATemplateCreateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  text?: string;
  example?: Record<string, unknown>;
  buttons?: Record<string, unknown>[];
}

export interface WATemplateCreatePayload {
  name: string;
  language: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  components: WATemplateCreateComponent[];
}

export interface WATemplateCreateResponse {
  id: string;
  status?: string;
  category?: string;
}

/**
 * Submit a message template to Meta for review.
 *
 * @param wabaId - The tenant's WhatsApp Business Account ID (TenantSettings.waBusinessAccountId).
 * @param apiKey - The tenant's WhatsApp access token (decrypted TenantSettings.waApiKey).
 * @returns The created template's Meta ID and initial review status.
 * @throws {Error} If Meta rejects the submission; the message carries Meta's own error text.
 */
export async function createMessageTemplate(
  wabaId: string,
  apiKey: string,
  payload: WATemplateCreatePayload
): Promise<WATemplateCreateResponse> {
  const res = await fetch(`${WA_BASE_URL}/${wabaId}/message_templates`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const raw = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    parsed = {};
  }

  if (!res.ok) {
    const metaError =
      (parsed.error as { message?: string } | undefined)?.message ??
      `Meta returned ${res.status} ${res.statusText}`;
    throw new Error(metaError);
  }

  return parsed as unknown as WATemplateCreateResponse;
}

export interface WATemplateStatusResponse {
  id: string;
  name?: string;
  status?: string;
  category?: string;
  rejected_reason?: string;
}

/**
 * Fetch a single template's current review state from Meta, by its template ID.
 *
 * @param templateId - The Meta template ID stored on MessageTemplate.waTemplateId.
 * @param apiKey - The tenant's WhatsApp access token (decrypted).
 * @throws {Error} If Meta responds with a non-2xx status.
 */
export async function getMessageTemplate(
  templateId: string,
  apiKey: string
): Promise<WATemplateStatusResponse> {
  const res = await fetch(
    `${WA_BASE_URL}/${templateId}?fields=name,status,category,rejected_reason`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );

  const raw = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    parsed = {};
  }

  if (!res.ok) {
    const metaError =
      (parsed.error as { message?: string } | undefined)?.message ??
      `Meta returned ${res.status} ${res.statusText}`;
    throw new Error(metaError);
  }

  return parsed as unknown as WATemplateStatusResponse;
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
