// ============================================================================
// ROUTE : /api/campaigns/scheduled  (GET)
//
// Lists the tenant's upcoming scheduled campaigns, soonest first. A focused
// companion to GET /api/campaigns?status=SCHEDULED for the scheduling UI.
// ============================================================================

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  try {
    const campaigns = await prisma.campaign.findMany({
      where: { tenantId, status: "SCHEDULED" },
      include: {
        template: { select: { id: true, name: true } },
        _count: { select: { contacts: true } },
      },
      orderBy: { scheduledAt: "asc" },
    });
    return NextResponse.json({ success: true, data: campaigns });
  } catch (error) {
    console.error("[CAMPAIGNS SCHEDULED GET]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch scheduled campaigns" }, { status: 500 });
  }
}
