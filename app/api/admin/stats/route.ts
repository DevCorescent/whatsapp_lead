// TODO [SHALMON]: Super-admin platform-wide statistics.
//
// GET /api/admin/stats
//   Returns:
//     - totalTenants, activeTenants
//     - totalUsers, activeUsersThisMonth
//     - totalMessages, messagesThisMonth
//     - MRR (sum of active subscription prices)
//     - totalLeads, wonLeads
//     - planBreakdown: { planName, count, revenue }[]
//     - signupsLast30Days: { date, count }[] (for chart)

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  // TODO [SHALMON]: Implement aggregation queries
  return NextResponse.json({ success: false, error: "Not implemented yet" }, { status: 501 });
}
