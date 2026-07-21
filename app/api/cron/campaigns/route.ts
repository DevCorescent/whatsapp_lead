// ============================================================================
// ROUTE : /api/cron/campaigns  (GET)
//
// The background scheduler's trigger. Meant to be called on a fixed interval by
// a cron (see vercel.json). On each tick it processes every campaign that is due
// (SCHEDULED and scheduledAt <= now).
//
// AUTH: this endpoint is machine-only. It is NOT session-authenticated — instead
// it requires the caller to present `Authorization: Bearer ${CRON_SECRET}`.
// Vercel Cron sends exactly this header automatically when CRON_SECRET is set in
// the project env. If CRON_SECRET is unset the route refuses to run, so it can
// never be left publicly triggerable by accident.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { processDueCampaigns } from "@/lib/campaigns/scheduler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processDueCampaigns();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[CRON CAMPAIGNS]", error);
    return NextResponse.json({ success: false, error: "Scheduler failed" }, { status: 500 });
  }
}
