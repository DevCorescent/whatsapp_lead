// ============================================================================
// ROUTE : GET /api/reseller/commissions
//
// The reseller's commission records: which client paid, how much, the rate, the
// commission and whether it has been paid out. Reseller accounts only;
// reseller.commissions.view. Optional ?status=PENDING|PAID|CANCELLED.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import type { CommissionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAccountScope, requireReseller } from "@/lib/accounts";
import { requirePermission } from "@/lib/permissions";

const STATUSES: CommissionStatus[] = ["PENDING", "PAID", "CANCELLED"];

export async function GET(req: NextRequest) {
  const scope = await getAccountScope();
  const notReseller = requireReseller(scope);
  if (notReseller) return notReseller;
  const denied = await requirePermission(scope, "reseller.commissions.view");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("status");
  const status = raw && STATUSES.includes(raw as CommissionStatus) ? (raw as CommissionStatus) : null;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50") || 50));
  const where = { resellerId: scope!.tenantId, ...(status && { status }) };

  const [total, rows, totals] = await Promise.all([
    prisma.resellerCommission.count({ where }),
    prisma.resellerCommission.findMany({
      where,
      select: {
        id: true, baseMinor: true, amountMinor: true, rate: true, currency: true, status: true,
        createdAt: true, paidAt: true, note: true,
        client: { select: { id: true, name: true } },
        payment: { select: { purpose: true, provider: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.resellerCommission.groupBy({
      by: ["status"],
      where: { resellerId: scope!.tenantId },
      _sum: { amountMinor: true },
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: rows,
    totals: Object.fromEntries(totals.map((t) => [t.status, t._sum.amountMinor ?? 0])),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
