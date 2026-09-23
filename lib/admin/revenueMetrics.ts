// ============================================================================
// MODULE : Revenue metrics (pure)
// ============================================================================
//
// Every rule the revenue report applies — period boundaries, what counts as a
// live subscription, how MRR becomes ARR/ARPU/LTV, and what Stripe considers a
// failed payment — with no database and no network access, so each one can be
// unit-tested (tests/revenue-report.test.ts).
//
// The two kinds of money this report deals in are deliberately never mixed:
//
//   Contracted MRR — what active subscriptions are priced at, summed from
//   Plan.priceMonthly in our own database. A run-rate, not cash: a workspace on a
//   ₹999 plan contributes ₹999 whether or not it has ever paid. This is what the
//   dashboard's MRR / ARR / ARPU / LTV tiles have always shown.
//
//   Collected revenue — money Stripe actually took. Nothing in this database
//   records a payment: there is no Payment, Invoice or Transaction model, and the
//   Stripe webhook only syncs subscription status, so Stripe is the system of
//   record, exactly as the tenant billing page treats it.
//
// Reporting one as the other is the most misleading thing this report could do,
// so they stay separate fields with separate names all the way to the spreadsheet.

import type Stripe from "stripe";


// ─── Period ──────────────────────────────────────────────────────────────────

export const REVENUE_RANGES = ["3m", "6m", "12m"] as const;
export type RevenueRange = (typeof REVENUE_RANGES)[number];

/**
 * Accept a range from a query string, from either spelling the UI uses.
 *
 * `range=12m` is what the dashboard sends; `period=12` is the plainer form.
 * Anything else is rejected rather than defaulted, so a typo in an export link
 * cannot silently hand someone a different period than they asked for.
 */
export function parseRevenueRange(raw: string | null | undefined): RevenueRange | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if ((REVENUE_RANGES as readonly string[]).includes(value)) return value as RevenueRange;
  if (value === "3" || value === "6" || value === "12") return `${value}m` as RevenueRange;
  return null;
}

export function monthsInRange(range: RevenueRange): number {
  return Number(range.replace("m", ""));
}

/** One calendar month of the reporting window. */
export interface ReportMonth {
  /** First instant of the month, local time. */
  start: Date;
  /** Last instant of the month — end-exclusive boundaries would double-count. */
  end: Date;
  /** "Sep 26", the label the dashboard chart already uses. */
  label: string;
  /** "2026-09", for sorting and for machine-readable output. */
  key: string;
}

/**
 * The window the report covers: whole calendar months, oldest first, ending with
 * the current (partial) month.
 *
 * Calendar months, not "the last 90 days" — the dashboard's trend chart has always
 * worked this way, and the export has to agree with the chart it sits under.
 */
export function buildMonthWindow(months: number, now: Date = new Date()): ReportMonth[] {
  return Array.from({ length: months }, (_, i) => {
    const start = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
    return {
      start,
      end,
      label: start.toLocaleString("en-IN", { month: "short", year: "2-digit" }),
      key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
    };
  });
}

// ─── Contracted MRR (our database) ───────────────────────────────────────────

/** The subscription fields these calculations need. */
export interface SubscriptionRow {
  createdAt: Date;
  cancelledAt: Date | null;
  status: string;
  planName: string;
  planDisplayName: string;
  priceMonthly: number;
}

/** Statuses that count as a live subscription — the dashboard's long-standing rule. */
export const ACTIVE_STATUSES = ["ACTIVE", "TRIALING"] as const;

/** Assumed customer lifetime, in months, behind LTV. See computeContractedMetrics. */
export const LTV_MONTHS = 24;

export interface ContractedMetrics {
  activeSubscriptions: number;
  mrr: number;
  arr: number;
  arpu: number;
  ltv: number;
}

/**
 * MRR / ARR / ARPU / LTV from live subscriptions — the same arithmetic the
 * Revenue dashboard has always used, moved here so both callers share it.
 *
 * ARR and LTV are projections, not observations: ARR assumes every current
 * subscription renews for twelve months, and LTV assumes an average lifetime of
 * LTV_MONTHS. Neither is money anyone has received, which is why the export
 * labels them "projected".
 */
export function computeContractedMetrics(subs: SubscriptionRow[]): ContractedMetrics {
  const active = subs.filter((s) => (ACTIVE_STATUSES as readonly string[]).includes(s.status));
  const mrr = active.reduce((sum, s) => sum + (s.priceMonthly || 0), 0);
  const arpu = active.length > 0 ? Math.round(mrr / active.length) : 0;
  return {
    activeSubscriptions: active.length,
    mrr,
    arr: mrr * 12,
    arpu,
    ltv: arpu * LTV_MONTHS,
  };
}

/** Was this subscription live at any point during the month? */
function liveInMonth(sub: SubscriptionRow, month: ReportMonth): boolean {
  return sub.createdAt <= month.end && (sub.cancelledAt === null || sub.cancelledAt > month.start);
}

export interface MonthlyContracted {
  month: ReportMonth;
  mrr: number;
  activeSubscriptions: number;
  /** MRR split by plan display name, for the by-plan sheet. */
  byPlan: Record<string, number>;
  /** The same split keyed by Plan.name (STARTER/GROWTH/…), for the dashboard chart. */
  byPlanName: Record<string, number>;
}

/**
 * Contracted MRR per month, counting every subscription that was live during it.
 *
 * Plans are keyed by their display name as stored, so a plan added later appears
 * on its own without anyone editing this file.
 */
export function monthlyContracted(
  subs: SubscriptionRow[],
  window: ReportMonth[],
): MonthlyContracted[] {
  return window.map((month) => {
    const live = subs.filter((s) => liveInMonth(s, month));
    const byPlan: Record<string, number> = {};
    const byPlanName: Record<string, number> = {};
    for (const sub of live) {
      byPlan[sub.planDisplayName] = (byPlan[sub.planDisplayName] ?? 0) + (sub.priceMonthly || 0);
      byPlanName[sub.planName] = (byPlanName[sub.planName] ?? 0) + (sub.priceMonthly || 0);
    }
    return {
      month,
      mrr: live.reduce((sum, s) => sum + (s.priceMonthly || 0), 0),
      activeSubscriptions: live.length,
      byPlan,
      byPlanName,
    };
  });
}

// ─── Collected revenue (Stripe) ──────────────────────────────────────────────

/** One Stripe invoice, flattened. Carries no payment links, card data or secrets. */
export interface TransactionRow {
  id: string;
  number: string | null;
  date: Date;
  tenant: string;
  plan: string;
  /** Major units (rupees, not paise). */
  amount: number;
  currency: string;
  /** Stripe's own status, upper-cased: PAID / OPEN / UNCOLLECTIBLE / VOID / DRAFT. */
  status: string;
  provider: "STRIPE";
  subscriptionId: string | null;
  /** Only ever populated for a failure Stripe explained; never invented. */
  failureReason: string | null;
}

/**
 * Did a payment attempt on this invoice fail?
 *
 * Stripe has no "failed invoice" status. A charge that bounces leaves the invoice
 * `open` with `attempted: true`, and one written off lands on `uncollectible`. A
 * draft or a voided invoice was never charged, and a paid one succeeded — so both
 * are excluded rather than counted as failures nobody experienced.
 */
export function isFailedInvoice(invoice: { status?: string | null; attempted?: boolean | null }): boolean {
  const status = (invoice.status ?? "").toLowerCase();
  if (status === "uncollectible") return true;
  return status === "open" && invoice.attempted === true;
}

export function isPaidInvoice(invoice: { status?: string | null }): boolean {
  return (invoice.status ?? "").toLowerCase() === "paid";
}

/** Map a Stripe invoice onto a report row, resolving the workspace it belongs to. */
export function toTransactionRow(
  invoice: Stripe.Invoice,
  lookup: (customerId: string | null) => { tenant: string; plan: string },
): TransactionRow {
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : (invoice.customer?.id ?? null);
  const { tenant, plan } = lookup(customerId);
  const paidAt = invoice.status_transitions?.paid_at ?? invoice.created;

  return {
    id: invoice.id ?? "",
    number: invoice.number ?? null,
    date: new Date(paidAt * 1000),
    tenant,
    plan,
    // Stripe holds minor units. amount_paid is what was actually taken; for an
    // unpaid invoice it is 0, so amount_due is what was attempted.
    amount: (isPaidInvoice(invoice) ? (invoice.amount_paid ?? 0) : (invoice.amount_due ?? 0)) / 100,
    currency: (invoice.currency ?? "inr").toUpperCase(),
    status: (invoice.status ?? "unknown").toUpperCase(),
    provider: "STRIPE",
    subscriptionId:
      typeof (invoice as unknown as { subscription?: string | { id: string } | null }).subscription === "string"
        ? ((invoice as unknown as { subscription?: string }).subscription ?? null)
        : (((invoice as unknown as { subscription?: { id?: string } }).subscription?.id) ?? null),
    failureReason: invoice.last_finalization_error?.message ?? null,
  };
}

// ─── The report ──────────────────────────────────────────────────────────────


export interface MonthlyReportRow {
  key: string;
  label: string;
  contractedMrr: number;
  /** MRR by Plan.name for this month, for the dashboard's stacked chart. */
  mrrByPlanName: Record<string, number>;
  activeSubscriptions: number;
  collectedRevenue: number | null;
  successfulTransactions: number | null;
  failedTransactions: number | null;
}

export interface PlanReportRow {
  plan: string;
  activeSubscriptions: number;
  mrr: number;
  collectedRevenue: number | null;
  shareOfCollected: number | null;
}

export interface RevenueReport {
  generatedAt: Date;
  range: RevenueRange;
  months: number;
  periodStart: Date;
  periodEnd: Date;
  /** Currency of every Plan.priceMonthly, and so of every contracted figure. */
  contractedCurrency: "INR";
  contracted: ContractedMetrics;
  monthly: MonthlyReportRow[];
  plans: PlanReportRow[];
  transactions: TransactionRow[];
  failedTransactions: TransactionRow[];
  collected: {
    /** False when STRIPE_SECRET_KEY is absent, or Stripe could not be reached. */
    available: boolean;
    /** Why the figures are missing — shown verbatim in the report. */
    unavailableReason: string | null;
    /** Totals per currency; Stripe can hold more than one. */
    totalsByCurrency: Record<string, number>;
    totalTransactions: number;
    successfulTransactions: number;
    failedTransactions: number;
  };
}

