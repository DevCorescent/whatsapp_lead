// TODO [GAURANSH]: Campaign management endpoints.
//
// GET /api/campaigns
//   - List all campaigns for tenant (paginated)
//   - Filters: status, dateRange
//   - Include: contact count, sent count, delivered %, failed count
//
// POST /api/campaigns
//   - Body: { name, templateId, contactIds | tagIds | "ALL" }
//   - Validate plan limits (maxCampaigns)
//   - Create campaign + CampaignContact rows in DB
//   - Then loop through each contact and call sendTextMessage()
//   - Update CampaignContact.status for each: "SENT" or "FAILED"
//   - Update campaign.status to "COMPLETED" when done
//
// NOTE: No queue/Redis needed — loop directly in this route.
// For very large campaigns (10k+), split into batches with a 1-second delay between batches.

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
