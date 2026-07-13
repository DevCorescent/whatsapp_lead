// TODO [GAURANSH]: Support ticket endpoints.
//
// GET /api/tickets
//   - List tickets for tenant (paginated)
//   - Filters: status, priority, assigneeId, contactId
//   - Sort: createdAt desc by default
//
// POST /api/tickets
//   - Body: { contactId, subject, description, priority, conversationId? }
//   - Auto-assign to agent with fewest open tickets (round-robin)

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  // TODO [GAURANSH]: Implement
  return NextResponse.json({ success: false, error: "Not implemented yet" }, { status: 501 });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  // TODO [GAURANSH]: Implement
  return NextResponse.json({ success: false, error: "Not implemented yet" }, { status: 501 });
}
