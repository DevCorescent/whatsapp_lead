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
    const err = await res.json();
    throw new Error(`WhatsApp API error: ${JSON.stringify(err)}`);
  }

  return res.json() as Promise<{ messages: [{ id: string }] }>;
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

// TODO [GAURANSH]: Add sendTemplateMessage, sendMediaMessage, sendInteractiveMessage, uploadMedia, getMediaUrl
