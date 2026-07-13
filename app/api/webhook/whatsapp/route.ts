// TODO [GAURANSH]: WhatsApp Cloud API Webhook Handler.
//
// GET  /api/webhook/whatsapp → Verification challenge from Meta
//   Query params: hub.mode, hub.verify_token, hub.challenge
//   Compare hub.verify_token against WHATSAPP_VERIFY_TOKEN env
//   If match: return hub.challenge as plain text (200)
//   If no match: return 403
//
// POST /api/webhook/whatsapp → Receive incoming messages and status updates
//   Meta will send: { object: "whatsapp_business_account", entry: [...] }
//   For each entry → changes → value:
//     1. If value.messages exists:
//        - Find tenant by waPhoneNumberId (value.metadata.phone_number_id)
//        - Find or create Contact by phone (messages[0].from)
//        - Find or create Conversation for this contact
//        - Save Message to DB
//        - If chatbot is active for this tenant → run flow
//        - If AI is enabled and autoReply=true → call /api/ai/reply
//        - Trigger Pusher "new-message" event
//     2. If value.statuses exists:
//        - Update message status in DB (DELIVERED, READ, FAILED)
//        - Trigger Pusher "message-status" event
//
// IMPORTANT: Always return 200 immediately to Meta (even on errors).
// Process heavy work in background (BullMQ queue) to avoid timeout.

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("[WEBHOOK] Verified successfully");
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  // TODO [GAURANSH]: Implement full message + status processing
  const body = await req.json();
  console.log("[WEBHOOK] Received:", JSON.stringify(body, null, 2));

  // Always return 200 to Meta immediately
  return NextResponse.json({ success: true }, { status: 200 });
}
