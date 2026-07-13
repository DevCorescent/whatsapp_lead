// TODO [GAURANSH]: Campaign management endpoints.
//
// GET /api/campaigns
//   - List all campaigns for tenant (paginated)
//   - Filters: status, dateRange
//   - Include: contact count, sent count, delivered %, failed count
//
// POST /api/campaigns
//   - Body: { name, templateId, contactIds | tagIds | "ALL", scheduledAt? }
//   - Validate plan limits (maxCampaigns)
//   - Create campaign + CampaignContact rows
//   - If scheduledAt is null → enqueue immediately via BullMQ
//   - If scheduledAt → schedule delayed BullMQ job

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
