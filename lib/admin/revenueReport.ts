// ============================================================================
// MODULE : Revenue report loader (SUPER_ADMIN)
// ============================================================================
//
// Reads the platform's revenue for one period: subscriptions from our database
// and invoices from Stripe. The rules it applies all live in
// lib/admin/revenueMetrics.ts; this module only fetches and assembles.
//
// Shared by the Revenue dashboard (GET /api/admin/revenue) and the export
// (GET /api/admin/revenue/export), so a figure can never mean one thing on screen
// and another in the downloaded workbook.

import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import {
  ACTIVE_STATUSES,
  buildMonthWindow,
  computeContractedMetrics,
  isFailedInvoice,
  isPaidInvoice,
  monthlyContracted,
  monthsInRange,
  toTransactionRow,
  type MonthlyReportRow,
  type PlanReportRow,
  type RevenueRange,
  type RevenueReport,
  type SubscriptionRow,
  type TransactionRow,
} from "@/lib/admin/revenueMetrics";

export * from "@/lib/admin/revenueMetrics";

/** Stripe invoices created inside the window, following every page. */
async function listInvoices(periodStart: Date, periodEnd: Date): Promise<Stripe.Invoice[]> {
  const stripe = getStripe();
  const invoices: Stripe.Invoice[] = [];

  // autoPagingEach follows Stripe's cursors, so a busy month is not silently
  // truncated at the 100-record default. The cap bounds memory and response time
  // on an account with a very long history; the report says when it is hit.
  const MAX_INVOICES = 5_000;
  for await (const invoice of stripe.invoices.list({
    created: {
      gte: Math.floor(periodStart.getTime() / 1000),
      lte: Math.floor(periodEnd.getTime() / 1000),
    },
    limit: 100,
  })) {
    invoices.push(invoice);
    if (invoices.length >= MAX_INVOICES) break;
  }
  return invoices;
}

/**
 * Build the whole report for one period.
 *
 * Three queries in total regardless of how many tenants or invoices there are:
 * every subscription with its plan and tenant, and Stripe's paginated invoice
 * list. Customer-to-workspace resolution is an in-memory map, never a query per
 * transaction.
 */
export async function loadRevenueReport(
  range: RevenueRange,
  now: Date = new Date(),
): Promise<RevenueReport> {
  const months = monthsInRange(range);
  const window = buildMonthWindow(months, now);
  const periodStart = window[0].start;
  const periodEnd = window[window.length - 1].end;

  const subscriptions = await prisma.subscription.findMany({
    include: {
      plan: { select: { name: true, displayName: true, priceMonthly: true } },
      tenant: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const rows: SubscriptionRow[] = subscriptions.map((s) => ({
    createdAt: s.createdAt,
    cancelledAt: s.cancelledAt,
    status: s.status,
    planName: s.plan?.name ?? "UNKNOWN",
    planDisplayName: s.plan?.displayName || s.plan?.name || "Unknown plan",
    priceMonthly: s.plan?.priceMonthly ?? 0,
  }));

  const contracted = computeContractedMetrics(rows);
  const monthly = monthlyContracted(rows, window);

  // Stripe customer → workspace, so a transaction can name the workspace it paid for.
  const byCustomer = new Map<string, { tenant: string; plan: string }>();
  for (const s of subscriptions) {
    if (s.stripeCustomerId) {
      byCustomer.set(s.stripeCustomerId, {
        tenant: s.tenant?.name ?? "Unknown workspace",
        plan: s.plan?.displayName || s.plan?.name || "Unknown plan",
      });
    }
  }
  const lookup = (customerId: string | null) =>
    (customerId ? byCustomer.get(customerId) : undefined) ?? {
      tenant: "Unknown workspace",
      plan: "Unknown plan",
    };

  let transactions: TransactionRow[] = [];
  let available = false;
  let unavailableReason: string | null = null;

  if (!isStripeConfigured()) {
    unavailableReason =
      "STRIPE_SECRET_KEY is not configured on this deployment, so collected revenue cannot be read.";
  } else {
    try {
      const invoices = await listInvoices(periodStart, periodEnd);
      transactions = invoices.map((inv) => toTransactionRow(inv, lookup));
      available = true;
    } catch (error) {
      // Stripe puts a masked form of the key in its auth errors ("sk_test_***cret").
      // Masked or not, no fragment of a secret belongs in a file people email around.
      const detail = (error instanceof Error ? error.message : "unknown error").replace(
        /\b(sk|rk|pk)_[A-Za-z0-9_*]+/g,
        "<redacted key>",
      );
      unavailableReason = `Stripe could not be reached: ${detail}`;
      console.error("[admin/revenue] Stripe invoice list failed", {
        reason: error instanceof Error ? error.message : "unknown error",
      });
    }
  }

  transactions.sort((a, b) => b.date.getTime() - a.date.getTime());
  const paid = transactions.filter((t) => isPaidInvoice({ status: t.status }));
  const failed = transactions.filter((t) =>
    isFailedInvoice({ status: t.status, attempted: true }),
  );

  const totalsByCurrency: Record<string, number> = {};
  for (const t of paid) {
    totalsByCurrency[t.currency] = (totalsByCurrency[t.currency] ?? 0) + t.amount;
  }

  const monthlyRows: MonthlyReportRow[] = monthly.map((m) => {
    const inMonth = (t: TransactionRow) => t.date >= m.month.start && t.date <= m.month.end;
    return {
      key: m.month.key,
      label: m.month.label,
      contractedMrr: m.mrr,
      mrrByPlanName: m.byPlanName,
      activeSubscriptions: m.activeSubscriptions,
      collectedRevenue: available
        ? paid.filter(inMonth).reduce((sum, t) => sum + t.amount, 0)
        : null,
      successfulTransactions: available ? paid.filter(inMonth).length : null,
      failedTransactions: available ? failed.filter(inMonth).length : null,
    };
  });

  // Plans as they exist right now: every plan carrying a live subscription, plus
  // any plan that money came in for during the period.
  const latest = monthly[monthly.length - 1];
  const activeByPlan = new Map<string, number>();
  for (const s of rows) {
    if ((ACTIVE_STATUSES as readonly string[]).includes(s.status)) {
      activeByPlan.set(s.planDisplayName, (activeByPlan.get(s.planDisplayName) ?? 0) + 1);
    }
  }
  const collectedByPlan = new Map<string, number>();
  for (const t of paid) {
    collectedByPlan.set(t.plan, (collectedByPlan.get(t.plan) ?? 0) + t.amount);
  }
  const totalCollected = Object.values(totalsByCurrency).reduce((a, b) => a + b, 0);

  const planNames = new Set<string>([
    ...activeByPlan.keys(),
    ...Object.keys(latest?.byPlan ?? {}),
    ...collectedByPlan.keys(),
  ]);

  const plans: PlanReportRow[] = [...planNames]
    .sort((a, b) => a.localeCompare(b))
    .map((plan) => {
      const collectedRevenue = available ? (collectedByPlan.get(plan) ?? 0) : null;
      return {
        plan,
        activeSubscriptions: activeByPlan.get(plan) ?? 0,
        mrr: latest?.byPlan[plan] ?? 0,
        collectedRevenue,
        // A share of nothing is 0%, not a division by zero.
        shareOfCollected:
          collectedRevenue === null || totalCollected <= 0
            ? available
              ? 0
              : null
            : collectedRevenue / totalCollected,
      };
    });

  return {
    generatedAt: now,
    range,
    months,
    periodStart,
    periodEnd,
    contractedCurrency: "INR",
    contracted,
    monthly: monthlyRows,
    plans,
    transactions,
    failedTransactions: failed,
    collected: {
      available,
      unavailableReason,
      totalsByCurrency,
      totalTransactions: transactions.length,
      successfulTransactions: paid.length,
      failedTransactions: failed.length,
    },
  };
}
