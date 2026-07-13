// TODO [GAURANSH]: Single conversation operations.
//
// GET /api/conversations/[id]
//   - Conversation details + paginated messages (50 per page, newest first)
//   - Include: contact info, assignedAgent, lead if linked
//
// PATCH /api/conversations/[id]
//   - Body: { status?, assigneeId?, isRead? }
//   - Status transitions: OPEN → RESOLVED | CLOSED, CLOSED → OPEN (reopen)
//   - Broadcast status change via Pusher to "tenant-{tenantId}" channel

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  // TODO [GAURANSH]: Implement with message pagination
  return NextResponse.json({ success: false, error: "Not implemented yet" }, { status: 501 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  // TODO [GAURANSH]: Implement status transition + Pusher broadcast
  return NextResponse.json({ success: false, error: "Not implemented yet" }, { status: 501 });
}
