// TODO [GAURANSH]: AI Lead Qualification endpoint.
//
// POST /api/ai/qualify
//   Body: { leadId }
//   Steps:
//     1. Get lead with contact info + conversation messages
//     2. Build prompt: "Based on these conversation messages, score this lead on BANT criteria.
//        Return JSON: { score: 0-100, budget: string, authority: string, requirement: string,
//        timeline: string, reasoning: string }"
//     3. Parse OpenAI JSON response
//     4. Update Lead.score, scoreLabel, budget, authority, requirement, timeline
//     5. Create LeadActivity (type: "AI_QUALIFICATION", content: reasoning)
//     6. Return updated lead

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  // TODO [GAURANSH]: Implement
  return NextResponse.json({ success: false, error: "Not implemented yet" }, { status: 501 });
}
