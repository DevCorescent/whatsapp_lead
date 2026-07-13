// TODO [GAURANSH]: GET list of conversations for the inbox.
//
// GET /api/conversations
//   Query: status (OPEN/ASSIGNED/RESOLVED/CLOSED), assignedToId, search, page, limit
//   Returns: conversations with contact info and lastMessage
//   Sort: lastMessageAt DESC
//   Security: Filter by tenantId

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  // TODO [GAURANSH]: Implement
  return NextResponse.json({ success: false, error: "Not implemented yet" }, { status: 501 });
}
