// TODO [GAURANSH]: AI Auto-Reply endpoint.
//
// POST /api/ai/reply
//   Body: { conversationId, incomingMessage }
//   Steps:
//     1. Get conversation + last 10 messages for context
//     2. Get TenantSettings (aiPersonality system prompt, aiModel)
//     3. Get relevant knowledge chunks from Pinecone (RAG lookup with incomingMessage)
//     4. Build OpenAI messages array:
//        - system: aiPersonality + knowledge context
//        - user/assistant: last 10 messages
//        - user: incomingMessage
//     5. Call OpenAI chat completion
//     6. Save AI response as Message (isAiGenerated=true)
//     7. Send via WhatsApp Cloud API
//     8. Return { reply }
//
// See lib/ai.ts for OpenAI client (TODO [GAURANSH]: build it)

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  // TODO [GAURANSH]: Implement RAG + OpenAI reply
  return NextResponse.json({ success: false, error: "Not implemented yet" }, { status: 501 });
}
