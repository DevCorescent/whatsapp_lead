// ============================================================================
// ROUTE : POST /api/segments/preview
//
// { rules } → how many contacts match, and the first 25 of them — powers the
// live count while the user builds filters. campaigns.view; active business.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";
import { requirePermission } from "@/lib/permissions";
import { segmentFiltersSchema } from "@/lib/segmentRules";
import { segmentWhere } from "@/lib/segments";

export async function POST(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermission(scope, "campaigns.view");
  if (denied) return denied;

  const parsed = segmentFiltersSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

  const where = await segmentWhere(scope.tenantId, scope.businessId, parsed.data.rules);
  const [count, sample] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where,
      select: {
        id: true, name: true, phone: true, location: true, optedOut: true,
        tags: { select: { tag: { select: { name: true, color: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);
  return NextResponse.json({ success: true, data: { count, sample } });
}
