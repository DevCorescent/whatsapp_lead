// TODO [GAURANSH]: AI Conversation Summarizer endpoint.
//
// POST /api/ai/summarize
//   Body: { conversationId }
//   Steps:
//     1. Get all messages in conversation
//     2. Prompt: "Summarize this WhatsApp conversation in 3-4 bullet points.
//        Include: customer intent, key concerns, action items."
//     3. Return { summary: string }

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  // TODO [GAURANSH]: Implement
  return NextResponse.json({ success: false, error: "Not implemented yet" }, { status: 501 });
}
