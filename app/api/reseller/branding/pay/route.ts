// ============================================================================
// ROUTE : POST /api/reseller/branding/pay
//
// Pay this month's white-label fee from the reseller's wallet now — e.g. right
// after topping up, to lift a suspension without waiting for the daily run.
// White-label reseller accounts only; billing.manage.
// ============================================================================

import { NextResponse } from "next/server";
import { getAccountScope, requireReseller } from "@/lib/accounts";
import { requirePermission } from "@/lib/permissions";
import { chargeWhiteLabelFee, whiteLabelFeeStatus } from "@/lib/whiteLabelFee";

export async function POST() {
  const scope = await getAccountScope();
  const notReseller = requireReseller(scope);
  if (notReseller) return notReseller;
  const denied = await requirePermission(scope, "billing.manage");
  if (denied) return denied;

  const outcome = await chargeWhiteLabelFee(scope!.tenantId);
  if (!outcome) {
    return NextResponse.json({ success: false, error: "Set up your branding first" }, { status: 400 });
  }
  if (outcome.status === "due") {
    return NextResponse.json(
      { success: false, error: "Not enough wallet balance for the fee — top up first", data: await whiteLabelFeeStatus(scope!.tenantId) },
      { status: 402 },
    );
  }
  return NextResponse.json({ success: true, data: await whiteLabelFeeStatus(scope!.tenantId) });
}
