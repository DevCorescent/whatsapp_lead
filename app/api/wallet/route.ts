// ============================================================================
// ROUTE : /api/wallet
//
// GET   - Balance, low-balance threshold, this account's message prices, and the
//         statement (paginated; `?format=csv` downloads it).
//         Anyone who can send campaigns or manage billing.
// PATCH - Change the low-balance alert threshold (billing.manage).
//
// Works for client and reseller accounts alike (a reseller funds its clients from
// its own wallet — see /api/reseller/clients/[id]/wallet).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAccountScope } from "@/lib/accounts";
import { toCsv } from "@/lib/csv";
import { can, requirePermission } from "@/lib/permissions";
import { getWallet, RATE_CATEGORIES, rateFor } from "@/lib/wallet";

const patchSchema = z.object({
  lowBalanceThresholdMinor: z.number().int().min(0).max(100_000_000),
});

export async function GET(req: NextRequest) {
  const scope = await getAccountScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!(await can(scope, "billing.manage")) && !(await can(scope, "campaigns.send"))) {
    return NextResponse.json({ success: false, error: "You don't have permission to do this" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "50") || 50));
  const csv = searchParams.get("format") === "csv";

  const wallet = await getWallet(scope.tenantId);
  const where = { tenantId: scope.tenantId };
  const paging: { skip?: number; take: number } = csv ? { take: 10_000 } : { skip: (page - 1) * limit, take: limit };
  const [total, txns, rates] = await Promise.all([
    prisma.walletTransaction.count({ where }),
    prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...paging,
      select: {
        id: true, type: true, amountMinor: true, balanceAfterMinor: true, description: true,
        referenceType: true, referenceId: true, createdAt: true,
      },
    }),
    Promise.all(RATE_CATEGORIES.map(async (category) => ({ category, priceMinor: await rateFor(scope.tenantId, category) }))),
  ]);

  if (csv) {
    const body = toCsv(txns, [
      { header: "Date", value: (t) => t.createdAt.toISOString() },
      { header: "Type", value: (t) => t.type },
      { header: "Description", value: (t) => t.description ?? "" },
      { header: "Amount (INR)", value: (t) => (t.amountMinor / 100).toFixed(2) },
      { header: "Balance after (INR)", value: (t) => (t.balanceAfterMinor / 100).toFixed(2) },
    ]);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="wallet-statement-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json({
    success: true,
    data: {
      balanceMinor: wallet.balanceMinor,
      currency: wallet.currency,
      lowBalanceThresholdMinor: wallet.lowBalanceThresholdMinor,
      rates,
      canTopUp: await can(scope, "billing.manage"),
      transactions: txns,
    },
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function PATCH(req: NextRequest) {
  const scope = await getAccountScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermission(scope, "billing.manage");
  if (denied) return denied;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

  await getWallet(scope.tenantId);
  await prisma.wallet.update({
    where: { tenantId: scope.tenantId },
    data: { lowBalanceThresholdMinor: parsed.data.lowBalanceThresholdMinor, lowBalanceNotifiedAt: null },
  });
  return NextResponse.json({ success: true });
}
