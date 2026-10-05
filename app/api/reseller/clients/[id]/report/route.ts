// ============================================================================
// ROUTE : GET /api/reseller/clients/[id]/report?days=7|30|90
//
// A client's activity for its reseller: messages sent / delivered / read /
// failed / received, a per-day chart, conversations, new contacts (a count),
// campaign delivery numbers and wallet spend. Counts only — see lib/clientReport.
//
// reseller.clients.view; any client the reseller manages or referred.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAccountScope, requireReseller, resellerClientsWhere } from "@/lib/accounts";
import { requirePermission } from "@/lib/permissions";
import { getClientReport, reportPeriod } from "@/lib/clientReport";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const scope = await getAccountScope();
  const notReseller = requireReseller(scope);
  if (notReseller) return notReseller;
  const denied = await requirePermission(scope, "reseller.clients.view");
  if (denied) return denied;
  const { id } = await params;

  const client = await prisma.tenant.findFirst({
    where: { id, ...resellerClientsWhere(scope!.tenantId) },
    select: { id: true },
  });
  if (!client) return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });

  try {
    const days = reportPeriod(new URL(req.url).searchParams.get("days"));
    return NextResponse.json({ success: true, data: await getClientReport(client.id, days) });
  } catch (error) {
    console.error("[RESELLER CLIENT REPORT]", error);
    return NextResponse.json({ success: false, error: "Failed to load the report" }, { status: 500 });
  }
}
