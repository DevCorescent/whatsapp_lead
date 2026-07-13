// TODO [GAURANSH]: Send a message via WhatsApp Cloud API.
//
// POST /api/messages
//   Body: { conversationId, type, content, mediaUrl?, isNote?, templateId?, templateVariables? }
//   Steps:
//     1. Validate body with sendMessageSchema
//     2. Get conversation → get contact phone → get TenantSettings (waPhoneNumberId, waApiKey)
//     3. If isNote=true → save to DB only (no WhatsApp send)
//     4. If type=TEXT → call WhatsApp Cloud API sendTextMessage()
//     5. If type=TEMPLATE → call sendTemplateMessage()
//     6. Save message to DB with waMessageId from Meta response
//     7. Update conversation.lastMessageAt and lastMessagePreview
//     8. Trigger Pusher event "new-message" on channel "conversation-{id}"
//
// See lib/whatsapp.ts for the API client (TODO [GAURANSH]: build it)

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  // TODO [GAURANSH]: Implement full send flow
  return NextResponse.json({ success: false, error: "Not implemented yet" }, { status: 501 });
}
