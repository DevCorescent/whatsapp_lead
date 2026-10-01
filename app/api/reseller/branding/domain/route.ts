// ============================================================================
// ROUTE : GET /api/reseller/branding/domain
//
// Whether the white-label reseller's saved custom domain is connected yet, and
// which DNS record is still missing if not. whitelabel.manage.
// ============================================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAccountScope, requireReseller } from "@/lib/accounts";
import { requirePermission } from "@/lib/permissions";
import { checkDomain } from "@/lib/vercelDomains";

export async function GET() {
  const scope = await getAccountScope();
  const notReseller = requireReseller(scope);
  if (notReseller) return notReseller;
  const denied = await requirePermission(scope, "whitelabel.manage");
  if (denied) return denied;

  const config = await prisma.whiteLabelConfig.findUnique({ where: { tenantId: scope!.tenantId }, select: { domain: true } });
  if (!config?.domain) return NextResponse.json({ success: true, data: null });
  return NextResponse.json({ success: true, data: { domain: config.domain, ...(await checkDomain(config.domain)) } });
}
