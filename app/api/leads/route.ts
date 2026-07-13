// TODO [GAURANSH]: Leads CRUD API.
//
// GET /api/leads
//   Query: stage, assignedToId, search, scoreLabel, page, limit
//   Returns leads grouped by stage for kanban, or flat list for table view
//
// POST /api/leads
//   Body: CreateLeadInput
//   Auto-calculate scoreLabel based on score
//   Create LeadActivity entry (type: "CREATED")

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
