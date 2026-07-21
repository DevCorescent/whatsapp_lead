// ============================================================================
// ROUTE : /api/cron/templates  (GET)
//
// Background template-status sync. Called on a fixed interval by a cron (see
// vercel.json), mirroring the campaign scheduler. Each tick refreshes every
// template still in review (SUBMITTED/PENDING) across all tenants.
//
// AUTH: machine-only. Requires `Authorization: Bearer ${CRON_SECRET}` — the same
// scheme as /api/cron/campaigns. If CRON_SECRET is unset the route refuses to run.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { syncAllTemplates } from "@/lib/templates";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncAllTemplates();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[CRON TEMPLATES]", error);
    return NextResponse.json({ success: false, error: "Template sync failed" }, { status: 500 });
  }
}
