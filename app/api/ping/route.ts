import { NextResponse } from "next/server";

/** Public health/ping — used for load testing and uptime monitoring. */
export async function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() });
}
