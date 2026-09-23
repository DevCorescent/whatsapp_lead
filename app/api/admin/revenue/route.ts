// ============================================================================
// ROUTE  : /api/admin/revenue
// GET    - Revenue analytics for the SUPER_ADMIN dashboard.
//
// ACCESS - SUPER_ADMIN only.
//
// The figures come from lib/admin/revenueReport.ts, which the export endpoint
// also reads, so the page and the downloaded report can never disagree.
//
// Two distinct things are returned and must stay distinct:
//   · mrr / arr / arpu / ltv — contracted run-rate from plan prices on active
//     subscriptions in our database. Not money received.
//   · transactions / failed — real Stripe invoices. Until this route was wired
//     to Stripe it returned two empty arrays, which is why the page could show a
//     healthy MRR above the words "No transactions".
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  isFailedInvoice,
  isPaidInvoice,
  loadRevenueReport,
  parseRevenueRange,
  type TransactionRow,
} from "@/lib/admin/revenueReport";

/** Most recent transactions the dashboard's table shows. */
const RECENT_LIMIT = 10;

/** Map a report row onto the shape the dashboard table renders. */
function toDashboardTransaction(t: TransactionRow) {
  return {
    id: t.id,
    tenant: t.tenant,
    plan: t.plan,
    amount: t.amount,
    gateway: t.provider,
    status: isPaidInvoice({ status: t.status })
      ? "PAID"
      : isFailedInvoice({ status: t.status, attempted: true })
        ? "FAILED"
        : "PENDING",
    date: t.date.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    // An unrecognised range falls back to 12 months, as this endpoint has always done.
    const range = parseRevenueRange(searchParams.get("range")) ?? "12m";

    const report = await loadRevenueReport(range);

    return NextResponse.json({
      success: true,
      data: {
        mrr: report.contracted.mrr,
        arr: report.contracted.arr,
        arpu: report.contracted.arpu,
        ltv: report.contracted.ltv,
        trend: report.monthly.map((m) => ({ month: m.label, mrr: m.contractedMrr })),
        byPlan: report.monthly.map((m) => ({
          month: m.label,
          starter: m.mrrByPlanName.STARTER ?? 0,
          growth: m.mrrByPlanName.GROWTH ?? 0,
          enterprise: m.mrrByPlanName.ENTERPRISE ?? 0,
        })),
        transactions: report.transactions.slice(0, RECENT_LIMIT).map(toDashboardTransaction),
        failed: report.failedTransactions.slice(0, RECENT_LIMIT).map(toDashboardTransaction),
        // So the page can say why the transaction tables are empty, rather than
        // leaving "No transactions" to mean both "none happened" and "not wired up".
        collected: {
          available: report.collected.available,
          unavailableReason: report.collected.unavailableReason,
          totalTransactions: report.collected.totalTransactions,
        },
      },
    });
  } catch (err) {
    console.error("[admin/revenue] ERROR:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
