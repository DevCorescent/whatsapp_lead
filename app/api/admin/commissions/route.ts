// ============================================================================
// ROUTE : GET /api/admin/commissions   (SUPER_ADMIN only)
//
// Every reseller commission, newest first, with totals by status. Filters:
// ?status=PENDING|PAID|CANCELLED, ?resellerId=.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import type { CommissionStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const STATUSES: CommissionStatus[] = ["PENDING", "PAID", "CANCELLED"];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("status");
  const status = raw && STATUSES.includes(raw as CommissionStatus) ? (raw as CommissionStatus) : null;
  const resellerId = searchParams.get("resellerId");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50") || 50));
  const where = { ...(status && { status }), ...(resellerId && { resellerId }) };

  const [total, rows, totals] = await Promise.all([
    prisma.resellerCommission.count({ where }),
    prisma.resellerCommission.findMany({
      where,
      select: {
        id: true, baseMinor: true, amountMinor: true, rate: true, currency: true, status: true,
        createdAt: true, paidAt: true, note: true,
        reseller: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        payment: { select: { provider: true, providerPaymentId: true, purpose: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.resellerCommission.groupBy({ by: ["status"], where: resellerId ? { resellerId } : {}, _sum: { amountMinor: true } }),
  ]);

  return NextResponse.json({
    success: true,
    data: rows,
    totals: Object.fromEntries(totals.map((t) => [t.status, t._sum.amountMinor ?? 0])),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
