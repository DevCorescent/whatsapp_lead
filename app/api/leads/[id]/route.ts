// TODO [GAURANSH]: Single lead operations.
//
// GET /api/leads/[id]  → lead details + activities timeline
//
// PATCH /api/leads/[id]
//   - Body: { stage?, score?, assigneeId?, value?, notes?, bantBudget?, bantAuthority?, bantNeed?, bantTimeline? }
//   - If stage changes → create LeadActivity { type: "STAGE_CHANGED", oldValue, newValue }
//   - Recalculate scoreLabel based on new score
//
// DELETE /api/leads/[id]  → soft delete (set isActive: false)

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  // TODO [GAURANSH]: Implement
  return NextResponse.json({ success: false, error: "Not implemented yet" }, { status: 501 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  // TODO [GAURANSH]: Implement stage transition logic + activity log
  return NextResponse.json({ success: false, error: "Not implemented yet" }, { status: 501 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  // TODO [GAURANSH]: Implement
  return NextResponse.json({ success: false, error: "Not implemented yet" }, { status: 501 });
}
