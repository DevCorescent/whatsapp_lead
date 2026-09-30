// ============================================================================
// ROUTE : GET /api/segments/options
//
// Pick-list values for the segment builder: cities/locations in use (with
// counts), sources, tags, lead stages, custom-field names. campaigns.view.
// ============================================================================

import { NextResponse } from "next/server";
import { getBusinessScope } from "@/lib/business";
import { requirePermission } from "@/lib/permissions";
import { segmentFieldOptions } from "@/lib/segments";

export async function GET() {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermission(scope, "campaigns.view");
  if (denied) return denied;
  return NextResponse.json({ success: true, data: await segmentFieldOptions(scope.tenantId, scope.businessId) });
}
