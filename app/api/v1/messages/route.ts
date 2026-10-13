/**
 * POST /api/v1/messages
 *
 * Send a WhatsApp message from your connected number.
 *
 * Auth: Authorization: Bearer <api_key>
 *
 * Body (text):
 *   { "to": "+919876543210", "type": "text", "text": "Hello!" }
 *
 * Body (template):
 *   { "to": "+919876543210", "type": "template", "template": "my_template", "language": "en_US",
 *     "components": [...] }
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateV1, unauthorized } from "@/lib/v1auth";
import { resolveWhatsAppCreds } from "@/lib/business";
import { sendTextMessage, sendTemplateMessage } from "@/lib/whatsapp";
import { z } from "zod";

const TextSchema = z.object({
  to: z.string().min(7, "Phone number too short"),
  type: z.literal("text"),
  text: z.string().min(1, "Message text is required"),
});

const TemplateSchema = z.object({
  to: z.string().min(7, "Phone number too short"),
  type: z.literal("template"),
  template: z.string().min(1, "Template name is required"),
  language: z.string().default("en_US"),
  components: z.array(z.record(z.string(), z.unknown())).optional(),
});

const SendSchema = z.discriminatedUnion("type", [TextSchema, TemplateSchema]);

export async function POST(req: NextRequest) {
  const scope = await authenticateV1(req);
  if (!scope) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = SendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 422 },
    );
  }

  const creds = await resolveWhatsAppCreds(scope.businessId);
  if (!creds.phoneNumberId || !creds.apiKey) {
    return NextResponse.json(
      { success: false, error: "WhatsApp is not connected for this business." },
      { status: 503 },
    );
  }

  try {
    const data = parsed.data;
    let result;
    if (data.type === "text") {
      result = await sendTextMessage(creds.phoneNumberId, creds.apiKey, data.to, data.text);
    } else {
      result = await sendTemplateMessage(
        creds.phoneNumberId,
        creds.apiKey,
        data.to,
        data.template,
        data.language,
        data.components as never[],
      );
    }
    return NextResponse.json({ success: true, messageId: result.messages?.[0]?.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send message";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
