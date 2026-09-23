import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  buildMonthWindow,
  computeContractedMetrics,
  isFailedInvoice,
  isPaidInvoice,
  monthlyContracted,
  parseRevenueRange,
  toTransactionRow,
  type RevenueReport,
  type SubscriptionRow,
  type TransactionRow,
} from "../lib/admin/revenueMetrics";
import { buildRevenueCsv, buildRevenueWorkbook, revenueReportFilename } from "../lib/admin/revenueExportFiles";

// ─────────────────────────────────────────────────────────────────────────────
// A revenue report is read as fact by whoever opens it. These cases are written
// as the misreadings they prevent: a projection presented as cash, a run-rate
// counted as a payment, an unreachable Stripe reported as "₹0 collected", or a
// workspace name with a comma in it shifting every column of a CSV.
// ─────────────────────────────────────────────────────────────────────────────

const sub = (over: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  createdAt: new Date("2026-01-01"),
  cancelledAt: null,
  status: "ACTIVE",
  planName: "STARTER",
  planDisplayName: "Starter",
  priceMonthly: 999,
  ...over,
});

// ─── Period parsing ──────────────────────────────────────────────────────────

test("the three supported ranges are accepted, in both spellings", () => {
  assert.equal(parseRevenueRange("3m"), "3m");
  assert.equal(parseRevenueRange("12M"), "12m");
  assert.equal(parseRevenueRange("6"), "6m");
});

test("an unsupported range is refused rather than defaulted", () => {
  // Defaulting would hand someone a different period than the one they asked for.
  for (const bad of ["1m", "24m", "", null, "all", "12 months", "3m; drop table"]) {
    assert.equal(parseRevenueRange(bad), null, `accepted ${JSON.stringify(bad)}`);
  }
});

// ─── Month window ────────────────────────────────────────────────────────────

test("the window is whole calendar months, oldest first, ending with this month", () => {
  const window = buildMonthWindow(3, new Date(2026, 8, 23)); // 23 Sep 2026
  assert.equal(window.length, 3);
  assert.deepEqual(window.map((m) => m.key), ["2026-07", "2026-08", "2026-09"]);
  assert.equal(window[0].start.getDate(), 1);
  assert.equal(window[0].start.getMonth(), 6);
  // End of July, not "30 days before today" — the export must line up with the chart.
  assert.equal(window[0].end.getMonth(), 6);
  assert.equal(window[0].end.getDate(), 31);
});

test("a window spanning a year boundary keeps the right years", () => {
  const window = buildMonthWindow(3, new Date(2026, 1, 15)); // Feb 2026
  assert.deepEqual(window.map((m) => m.key), ["2025-12", "2026-01", "2026-02"]);
});

// ─── Contracted metrics ──────────────────────────────────────────────────────

test("only live subscriptions contribute to MRR", () => {
  const metrics = computeContractedMetrics([
    sub({ priceMonthly: 999, status: "ACTIVE" }),
    sub({ priceMonthly: 2999, status: "TRIALING" }),
    sub({ priceMonthly: 9999, status: "CANCELLED" }),
    sub({ priceMonthly: 9999, status: "PAST_DUE" }),
    sub({ priceMonthly: 9999, status: "EXPIRED" }),
  ]);
  assert.equal(metrics.activeSubscriptions, 2);
  assert.equal(metrics.mrr, 3998);
});

test("ARR and LTV are the documented projections of MRR", () => {
  const metrics = computeContractedMetrics([sub({ priceMonthly: 1000 }), sub({ priceMonthly: 2000 })]);
  assert.equal(metrics.mrr, 3000);
  assert.equal(metrics.arr, 36_000); // MRR × 12
  assert.equal(metrics.arpu, 1500); // MRR ÷ 2 subscriptions
  assert.equal(metrics.ltv, 36_000); // ARPU × 24 months
});

test("a platform with no live subscriptions reports zeros, not NaN", () => {
  const metrics = computeContractedMetrics([sub({ status: "CANCELLED" })]);
  assert.deepEqual(metrics, { activeSubscriptions: 0, mrr: 0, arr: 0, arpu: 0, ltv: 0 });
});

// ─── Monthly series ──────────────────────────────────────────────────────────

test("a subscription counts from the month it started, not before", () => {
  const window = buildMonthWindow(3, new Date(2026, 8, 23));
  const series = monthlyContracted([sub({ createdAt: new Date(2026, 7, 10), priceMonthly: 999 })], window);
  assert.deepEqual(series.map((m) => m.mrr), [0, 999, 999]);
  assert.deepEqual(series.map((m) => m.activeSubscriptions), [0, 1, 1]);
});

test("a cancelled subscription stops counting after the month it left", () => {
  const window = buildMonthWindow(3, new Date(2026, 8, 23));
  const series = monthlyContracted(
    [sub({ createdAt: new Date(2026, 0, 1), cancelledAt: new Date(2026, 7, 15), priceMonthly: 999 })],
    window,
  );
  assert.deepEqual(series.map((m) => m.mrr), [999, 999, 0]);
});

test("plans are split by their own names, including plans added later", () => {
  const window = buildMonthWindow(1, new Date(2026, 8, 23));
  const [month] = monthlyContracted(
    [
      sub({ planName: "STARTER", planDisplayName: "Starter", priceMonthly: 999 }),
      sub({ planName: "CUSTOM_NGO", planDisplayName: "NGO tier", priceMonthly: 500 }),
    ],
    window,
  );
  assert.deepEqual(month.byPlan, { Starter: 999, "NGO tier": 500 });
  assert.deepEqual(month.byPlanName, { STARTER: 999, CUSTOM_NGO: 500 });
});

// ─── Stripe invoice classification ───────────────────────────────────────────

test("only a paid invoice counts as collected revenue", () => {
  assert.equal(isPaidInvoice({ status: "paid" }), true);
  for (const status of ["open", "draft", "void", "uncollectible"]) {
    assert.equal(isPaidInvoice({ status }), false, status);
  }
});

test("a failed payment is an attempted charge that did not succeed", () => {
  assert.equal(isFailedInvoice({ status: "open", attempted: true }), true);
  assert.equal(isFailedInvoice({ status: "uncollectible" }), true);
  // Never charged: counting these would invent failures nobody experienced.
  assert.equal(isFailedInvoice({ status: "open", attempted: false }), false);
  assert.equal(isFailedInvoice({ status: "draft", attempted: false }), false);
  assert.equal(isFailedInvoice({ status: "void" }), false);
  assert.equal(isFailedInvoice({ status: "paid", attempted: true }), false);
});

test("an invoice becomes a row in major units, attributed to its workspace", () => {
  const row = toTransactionRow(
    {
      id: "in_123",
      number: "A-0001",
      status: "paid",
      currency: "inr",
      amount_paid: 99900, // paise
      amount_due: 99900,
      created: 1_756_000_000,
      status_transitions: { paid_at: 1_756_600_000 },
      customer: "cus_1",
    } as never,
    () => ({ tenant: "Vertex Motors", plan: "Growth" }),
  );
  assert.equal(row.amount, 999);
  assert.equal(row.currency, "INR");
  assert.equal(row.tenant, "Vertex Motors");
  assert.equal(row.date.getTime(), 1_756_600_000 * 1000);
});

test("an unpaid invoice reports what was attempted, not what was received", () => {
  const row = toTransactionRow(
    { id: "in_9", status: "open", currency: "inr", amount_paid: 0, amount_due: 299900, created: 1, customer: "cus_x" } as never,
    () => ({ tenant: "Nova Realty", plan: "Growth" }),
  );
  assert.equal(row.amount, 2999);
  assert.equal(row.status, "OPEN");
});

test("an invoice for an unknown customer is labelled, never guessed", () => {
  const row = toTransactionRow(
    { id: "in_x", status: "paid", currency: "usd", amount_paid: 100, created: 1, customer: null } as never,
    () => ({ tenant: "Unknown workspace", plan: "Unknown plan" }),
  );
  assert.equal(row.tenant, "Unknown workspace");
});

test("no payment link or card data can reach a transaction row", () => {
  const row = toTransactionRow(
    {
      id: "in_1", status: "paid", currency: "inr", amount_paid: 100, created: 1, customer: "cus_1",
      hosted_invoice_url: "https://invoice.stripe.com/secret-token",
      invoice_pdf: "https://pay.stripe.com/secret.pdf",
      customer_email: "someone@example.com",
    } as never,
    () => ({ tenant: "T", plan: "P" }),
  );
  const serialised = JSON.stringify(row);
  assert.ok(!serialised.includes("secret-token"));
  assert.ok(!serialised.includes("secret.pdf"));
  assert.ok(!serialised.includes("someone@example.com"));
});

// ─── File builders ───────────────────────────────────────────────────────────

const tx = (over: Partial<TransactionRow> = {}): TransactionRow => ({
  id: "in_1",
  number: "A-1",
  date: new Date("2026-09-10T10:00:00Z"),
  tenant: "Vertex Motors",
  plan: "Growth",
  amount: 2999,
  currency: "INR",
  status: "PAID",
  provider: "STRIPE",
  subscriptionId: "sub_1",
  failureReason: null,
  ...over,
});

function report(over: Partial<RevenueReport> = {}): RevenueReport {
  return {
    generatedAt: new Date("2026-09-23T09:30:00Z"),
    range: "3m",
    months: 3,
    periodStart: new Date(2026, 6, 1),
    periodEnd: new Date(2026, 8, 30, 23, 59, 59, 999),
    contractedCurrency: "INR",
    contracted: { activeSubscriptions: 30, mrr: 49_970, arr: 599_640, arpu: 1666, ltv: 39_984 },
    monthly: [
      { key: "2026-07", label: "Jul 26", contractedMrr: 40_000, mrrByPlanName: {}, activeSubscriptions: 25, collectedRevenue: 0, successfulTransactions: 0, failedTransactions: 0 },
      { key: "2026-08", label: "Aug 26", contractedMrr: 45_000, mrrByPlanName: {}, activeSubscriptions: 28, collectedRevenue: 2999, successfulTransactions: 1, failedTransactions: 0 },
      { key: "2026-09", label: "Sep 26", contractedMrr: 49_970, mrrByPlanName: {}, activeSubscriptions: 30, collectedRevenue: 0, successfulTransactions: 0, failedTransactions: 1 },
    ],
    plans: [
      { plan: "Growth", activeSubscriptions: 10, mrr: 29_990, collectedRevenue: 2999, shareOfCollected: 1 },
      { plan: "Starter", activeSubscriptions: 20, mrr: 19_980, collectedRevenue: 0, shareOfCollected: 0 },
    ],
    transactions: [tx()],
    failedTransactions: [],
    collected: {
      available: true,
      unavailableReason: null,
      totalsByCurrency: { INR: 2999 },
      totalTransactions: 1,
      successfulTransactions: 1,
      failedTransactions: 0,
    },
    ...over,
  };
}

test("the filename carries the period and the generation date", () => {
  assert.equal(revenueReportFilename(report()), "revenue-report-3-months-2026-09-23");
});

test("the workbook has the five documented sheets", () => {
  const wb = XLSX.read(buildRevenueWorkbook(report()), { type: "buffer" });
  assert.deepEqual(wb.SheetNames, [
    "Revenue Summary",
    "Monthly Revenue",
    "Revenue by Plan",
    "Transactions",
    "Failed Payments",
  ]);
});

test("the workbook separates contracted run-rate from money actually collected", () => {
  const wb = XLSX.read(buildRevenueWorkbook(report()), { type: "buffer" });
  const summary = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Revenue Summary"], { header: 1 });
  const find = (label: string) => summary.find((r) => String(r[0] ?? "").startsWith(label));

  assert.equal(find("MRR (contracted")?.[1], 49_970);
  assert.equal(find("ARR (projected")?.[1], 599_640);
  assert.equal(find("Total collected revenue")?.[1], 2999);
  // The two must never appear under one heading called "revenue".
  assert.ok(summary.some((r) => String(r[0]).includes("Not money received")));
});

test("monthly rows are written as numbers a spreadsheet can sum", () => {
  const wb = XLSX.read(buildRevenueWorkbook(report()), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["Monthly Revenue"]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0]["Month"], "Jul 26");
  assert.equal(rows[2]["Contracted MRR (INR)"], 49_970);
  assert.equal(typeof rows[1]["Collected revenue"], "number");
});

test("an empty period says so instead of leaving a blank sheet", () => {
  const empty = report({
    transactions: [],
    failedTransactions: [],
    collected: {
      available: true,
      unavailableReason: null,
      totalsByCurrency: {},
      totalTransactions: 0,
      successfulTransactions: 0,
      failedTransactions: 0,
    },
  });
  const wb = XLSX.read(buildRevenueWorkbook(empty), { type: "buffer" });
  const transactions = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Transactions"], { header: 1 });
  const failed = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Failed Payments"], { header: 1 });
  assert.equal(transactions[1][0], "No transactions recorded for this period.");
  assert.equal(failed[1][0], "No failed payments recorded for this period.");

  const csv = buildRevenueCsv(empty);
  assert.ok(csv.includes("No transactions recorded for this period."));
  assert.ok(csv.includes("Total collected revenue,0"));
});

test("an unreachable Stripe is reported as unavailable, never as zero revenue", () => {
  const offline = report({
    transactions: [],
    failedTransactions: [],
    monthly: report().monthly.map((m) => ({
      ...m,
      collectedRevenue: null,
      successfulTransactions: null,
      failedTransactions: null,
    })),
    plans: report().plans.map((p) => ({ ...p, collectedRevenue: null, shareOfCollected: null })),
    collected: {
      available: false,
      unavailableReason: "STRIPE_SECRET_KEY is not configured on this deployment, so collected revenue cannot be read.",
      totalsByCurrency: {},
      totalTransactions: 0,
      successfulTransactions: 0,
      failedTransactions: 0,
    },
  });

  const csv = buildRevenueCsv(offline);
  assert.ok(csv.includes("Total collected revenue,N/A"));
  assert.ok(csv.includes("STRIPE_SECRET_KEY is not configured"));
  assert.ok(!csv.includes("Total collected revenue,0"));

  const wb = XLSX.read(buildRevenueWorkbook(offline), { type: "buffer" });
  const summary = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Revenue Summary"], { header: 1 });
  assert.equal(summary.find((r) => String(r[0]).startsWith("Total collected revenue"))?.[1], "N/A");
  // The contracted side is still real and must still be reported.
  assert.equal(summary.find((r) => String(r[0]).startsWith("MRR (contracted"))?.[1], 49_970);
});

test("a workspace name containing a comma and quotes cannot shift CSV columns", () => {
  const csv = buildRevenueCsv(
    report({ transactions: [tx({ tenant: 'Sharma, Verma & Co "Pvt"' })] }),
  );
  assert.ok(csv.includes('"Sharma, Verma & Co ""Pvt"""'));

  // Parsed back, the row still has its columns in the right places.
  const section = csv.split("# Transactions\r\n")[1].split("\r\n\r\n")[0];
  const sheet = XLSX.read(section, { type: "string", raw: true }).Sheets.Sheet1;
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
  assert.equal(rows[0]["Workspace"], 'Sharma, Verma & Co "Pvt"');
  assert.equal(rows[0]["Currency"], "INR");
});

test("CSV amounts are plain numbers, not formatted rupee strings", () => {
  const csv = buildRevenueCsv(report());
  assert.ok(csv.includes("2999"));
  assert.ok(!csv.includes("₹2,999"));
  assert.ok(csv.includes("Subscription currency,INR"));
});
