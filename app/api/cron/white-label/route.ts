// ============================================================================
// ROUTE : /api/cron/white-label  (GET, Vercel cron, daily)
//
// Charges each white-label reseller's monthly fee from its wallet (once per
// month), retries unpaid ones, suspends brands past the grace period and restores
// them once paid. See lib/whiteLabelFee.ts.
//
// ACCESS: `Authorization: Bearer $CRON_SECRET`; refused when the secret is unset.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { chargeWhiteLabelFee } from "@/lib/whiteLabelFee";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resellers = await prisma.tenant.findMany({
    where: { accountType: "RESELLER", resellerType: "WHITE_LABEL", isActive: true, whiteLabel: { isNot: null } },
    select: { id: true },
  });

  const tally: Record<string, number> = {};
  for (const r of resellers) {
    try {
      const outcome = await chargeWhiteLabelFee(r.id);
      const key = outcome ? (outcome.status === "due" && outcome.suspended ? "suspended" : outcome.status) : "skipped";
      tally[key] = (tally[key] ?? 0) + 1;
    } catch (e) {
      tally.error = (tally.error ?? 0) + 1;
      console.error("[CRON WHITE-LABEL] charge failed", { tenantId: r.id, error: String(e) });
    }
  }
  console.log("[CRON WHITE-LABEL] Done", tally);
  return NextResponse.json({ success: true, resellers: resellers.length, ...tally });
}
