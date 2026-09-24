import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
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
import { buildRevenueCsv, buildRevenueWorkbook, CSV_COLUMNS, revenueReportFilename } from "../lib/admin/revenueExportFiles";

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

/** A report whose Stripe side could not be read at all. */
const offlineReport = () =>
  report({
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
      unavailableReason: "Invalid API Key provided: <redacted key>",
      totalsByCurrency: {},
      totalTransactions: 0,
      successfulTransactions: 0,
      failedTransactions: 0,
    },
  });

/** Parse the CSV the way a spreadsheet would: quoted fields may hold commas. */
function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (quoted) {
      if (c === '"' && csv[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\r" && csv[i + 1] === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

const cell = (rows: string[][], header: string, r: string[]) => r[rows[0].indexOf(header)];

test("the filename carries the period and the generation date", () => {
  assert.equal(revenueReportFilename(report()), "revenue-report-3-months-2026-09-23");
  assert.equal(revenueReportFilename(report({ range: "12m", months: 12 })), "revenue-report-12-months-2026-09-23");
});

// ─── CSV: one flat table ─────────────────────────────────────────────────────

test("the CSV is a single table: one header row, and every row has the same width", () => {
  const rows = parseCsv(buildRevenueCsv(report()));
  assert.deepEqual(rows[0], [...CSV_COLUMNS]);
  const widths = new Set(rows.map((r) => r.length));
  assert.deepEqual([...widths], [CSV_COLUMNS.length], "ragged rows would break every parser");
  // The old export stacked pseudo-tables, each with its own header line.
  assert.equal(rows.filter((r) => r[0] === "Section").length, 1);
  assert.ok(!buildRevenueCsv(report()).includes("Field,Value"));
  assert.ok(!buildRevenueCsv(report()).includes("# "));
});

test("every CSV row is classified by Section, and the sections are the expected ones", () => {
  const rows = parseCsv(buildRevenueCsv(report()));
  const sections = new Set(rows.slice(1).map((r) => r[0]));
  assert.deepEqual(
    [...sections].sort(),
    ["Collected Revenue", "Contracted Metrics", "Data Status", "Monthly Revenue", "Report", "Revenue by Plan", "Transaction"],
  );
});

test("a transaction row carries its own identifiers and a numeric amount", () => {
  const rows = parseCsv(buildRevenueCsv(report()));
  const t = rows.find((r) => r[0] === "Transaction")!;
  assert.equal(cell(rows, "Transaction ID", t), "in_1");
  assert.equal(cell(rows, "Invoice Number", t), "A-1");
  assert.equal(cell(rows, "Workspace", t), "Vertex Motors");
  assert.equal(cell(rows, "Value", t), "2999");
  assert.equal(cell(rows, "Currency", t), "INR");
  assert.equal(cell(rows, "Status", t), "PAID");
  assert.equal(cell(rows, "Date", t), "2026-09-10T10:00:00.000Z");
});

test("an unavailable Stripe contributes no transaction rows and no fake failure rows", () => {
  const rows = parseCsv(buildRevenueCsv(offlineReport()));
  assert.equal(rows.filter((r) => r[0] === "Transaction").length, 0);
  assert.equal(rows.filter((r) => r[0] === "Failed Payment").length, 0);
  // The reason belongs in Data Status, never in a transaction row.
  const status = rows.find((r) => r[0] === "Data Status" && r[1] === "Stripe invoices")!;
  assert.equal(cell(rows, "Status", status), "Unavailable");
  assert.match(cell(rows, "Value", status), /Invalid API Key/);
});

test("unavailable is N/A and a real zero is 0 — never the other way round", () => {
  const offline = parseCsv(buildRevenueCsv(offlineReport()));
  const offlineTotal = offline.find((r) => r[1] === "Total Collected Revenue")!;
  assert.equal(cell(offline, "Value", offlineTotal), "N/A");

  const queried = parseCsv(
    buildRevenueCsv(
      report({
        transactions: [],
        collected: { available: true, unavailableReason: null, totalsByCurrency: {}, totalTransactions: 0, successfulTransactions: 0, failedTransactions: 0 },
      }),
    ),
  );
  const queriedTotal = queried.find((r) => r[1] === "Total Collected Revenue")!;
  assert.equal(cell(queried, "Value", queriedTotal), "0");
});

test("contracted metrics are never labelled as collected revenue", () => {
  const rows = parseCsv(buildRevenueCsv(report()));
  const mrr = rows.find((r) => r[1] === "MRR (Contracted)")!;
  assert.equal(mrr[0], "Contracted Metrics");
  assert.equal(cell(rows, "Value", mrr), "49970");
  assert.equal(cell(rows, "Currency", mrr), "INR");
  assert.ok(rows.some((r) => r[0] === "Collected Revenue" && r[1] === "Total Collected Revenue"));
});

test("the monthly section covers every month of the selected period", () => {
  for (const [months, keys] of [
    [3, ["2026-07", "2026-08", "2026-09"]],
    [6, ["2026-04", "2026-09"]],
    [12, ["2025-10", "2026-09"]],
  ] as [number, string[]][]) {
    const window = buildMonthWindow(months, new Date(2026, 8, 23));
    const rows = parseCsv(
      buildRevenueCsv(
        report({
          months,
          range: `${months}m` as RevenueReport["range"],
          monthly: window.map((m) => ({
            key: m.key, label: m.label, contractedMrr: 1, mrrByPlanName: {},
            activeSubscriptions: 1, collectedRevenue: 0, successfulTransactions: 0, failedTransactions: 0,
          })),
        }),
      ),
    );
    const monthKeys = [...new Set(rows.filter((r) => r[0] === "Monthly Revenue").map((r) => r[2]))];
    assert.equal(monthKeys.length, months);
    for (const key of keys) assert.ok(monthKeys.includes(key), `${months}m missing ${key}`);
  }
});

test("dates are one consistent machine-readable format", () => {
  const rows = parseCsv(buildRevenueCsv(report()));
  const start = rows.find((r) => r[1] === "Period start")!;
  assert.equal(cell(rows, "Value", start), "2026-07-01");
  const generated = rows.find((r) => r[1] === "Generated at")!;
  assert.equal(cell(rows, "Value", generated), "2026-09-23T09:30:00.000Z");
});

test("a workspace name with a comma and quotes cannot shift columns", () => {
  const csv = buildRevenueCsv(report({ transactions: [tx({ tenant: 'Sharma, Verma & Co "Pvt"' })] }));
  assert.ok(csv.includes('"Sharma, Verma & Co ""Pvt"""'));
  const rows = parseCsv(csv);
  const t = rows.find((r) => r[0] === "Transaction")!;
  assert.equal(cell(rows, "Workspace", t), 'Sharma, Verma & Co "Pvt"');
  assert.equal(cell(rows, "Currency", t), "INR");
  assert.equal(t.length, CSV_COLUMNS.length);
});

test("CSV money is a plain number, not a formatted rupee string", () => {
  const csv = buildRevenueCsv(report());
  assert.ok(csv.includes("49970"));
  assert.ok(!csv.includes("₹49,970"));
});

// ─── XLSX: a formatted workbook ──────────────────────────────────────────────

async function readWorkbook(report: RevenueReport) {
  const wb = new ExcelJS.Workbook();
  const buffer = await buildRevenueWorkbook(report);
  // ExcelJS types its loader against its own Buffer shape; the bytes are identical.
  await wb.xlsx.load(new Uint8Array(buffer).buffer as ArrayBuffer);
  return wb;
}

/** The header row of a sheet: the first row whose first cell matches `first`. */
function headerRowOf(sheet: ExcelJS.Worksheet, first: string) {
  for (let r = 1; r <= sheet.rowCount; r++) {
    if (String(sheet.getRow(r).getCell(1).value ?? "") === first) return sheet.getRow(r);
  }
  throw new Error(`header starting with ${first} not found`);
}

test("the workbook has the six documented sheets", async () => {
  const wb = await readWorkbook(report());
  assert.deepEqual(wb.worksheets.map((s) => s.name), [
    "Revenue Summary",
    "Monthly Revenue",
    "Revenue by Plan",
    "Transactions",
    "Failed Payments",
    "Data Status",
  ]);
});

test("table headers are bold and frozen, with an autofilter", async () => {
  const wb = await readWorkbook(report());
  const sheet = wb.getWorksheet("Monthly Revenue")!;
  const header = headerRowOf(sheet, "Month");
  assert.equal(header.font?.bold, true);
  assert.equal(sheet.views[0]?.state, "frozen");
  assert.equal(sheet.views[0]?.ySplit, header.number);
  assert.ok(sheet.autoFilter, "an unfiltered table of 12 months is harder to read");
});

test("money and counts carry number formats, so the sheet can be summed", async () => {
  const wb = await readWorkbook(report());
  const sheet = wb.getWorksheet("Monthly Revenue")!;
  const header = headerRowOf(sheet, "Month");
  const first = sheet.getRow(header.number + 1);
  assert.equal(first.getCell(3).value, 40_000);
  assert.match(String(first.getCell(3).numFmt), /#,##0/);
  assert.equal(typeof first.getCell(7).value, "number");
});

test("the summary separates contracted run-rate from collected revenue", async () => {
  const wb = await readWorkbook(report());
  const sheet = wb.getWorksheet("Revenue Summary")!;
  const labels: string[] = [];
  sheet.eachRow((row) => labels.push(String(row.getCell(1).value ?? "")));
  assert.ok(labels.includes("Contracted subscription metrics"));
  assert.ok(labels.includes("Collected revenue"));
  assert.ok(labels.some((l) => l.startsWith("MRR (Contracted)")));
  assert.ok(labels.some((l) => l.startsWith("Total collected revenue")));
});

test("Transactions holds only real invoices, never a status message", async () => {
  const wb = await readWorkbook(report());
  const sheet = wb.getWorksheet("Transactions")!;
  const header = headerRowOf(sheet, "Transaction ID");
  const body: unknown[][] = [];
  sheet.eachRow((row, n) => {
    if (n > header.number) body.push([row.getCell(1).value, row.getCell(4).value, row.getCell(6).value]);
  });
  assert.equal(body.length, 1);
  assert.deepEqual(body[0], ["in_1", "Vertex Motors", 2999]);
});

test("an unavailable Stripe leaves the transaction tables empty and explains itself elsewhere", async () => {
  const wb = await readWorkbook(offlineReport());

  for (const name of ["Transactions", "Failed Payments"]) {
    const sheet = wb.getWorksheet(name)!;
    const header = headerRowOf(sheet, "Transaction ID");
    let dataRows = 0;
    sheet.eachRow((_row, n) => {
      if (n > header.number) dataRows++;
    });
    assert.equal(dataRows, 0, `${name} must not contain a fabricated row`);
  }

  const status = wb.getWorksheet("Data Status")!;
  const rows: string[][] = [];
  status.eachRow((row) => rows.push([String(row.getCell(1).value ?? ""), String(row.getCell(2).value ?? ""), String(row.getCell(3).value ?? "")]));
  const stripe = rows.find((r) => r[0] === "Stripe invoices")!;
  assert.equal(stripe[1], "Unavailable");
  assert.match(stripe[2], /Invalid API Key/);
  assert.equal(rows.find((r) => r[0] === "Subscriptions")?.[1], "Available");
});

test("an unavailable source reports N/A in the summary, never 0", async () => {
  const wb = await readWorkbook(offlineReport());
  const sheet = wb.getWorksheet("Revenue Summary")!;
  const values = new Map<string, unknown>();
  sheet.eachRow((row) => values.set(String(row.getCell(1).value ?? ""), row.getCell(2).value));
  assert.equal(values.get("Total collected revenue"), "N/A");
  assert.equal(values.get("Transaction count"), "N/A");
  // The contracted side is still real and still reported.
  assert.equal(values.get("MRR (Contracted)"), 49_970);
});

test("revenue share is blank-safe: N/A when collected revenue is unknown", async () => {
  const wb = await readWorkbook(offlineReport());
  const sheet = wb.getWorksheet("Revenue by Plan")!;
  const header = headerRowOf(sheet, "Plan");
  const first = sheet.getRow(header.number + 1);
  assert.equal(first.getCell(4).value, "N/A");
  assert.equal(first.getCell(5).value, "N/A");
  assert.equal(typeof first.getCell(3).value, "number"); // contracted MRR is known
});
