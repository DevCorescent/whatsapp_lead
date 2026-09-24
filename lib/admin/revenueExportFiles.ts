// ============================================================================
// MODULE : Revenue report → .xlsx / .csv
// ============================================================================
//
// Turns the report built by lib/admin/revenueReport.ts into the two files the
// Revenue page offers. Nothing here recalculates anything: every number arrives
// already computed, so the workbook, the CSV and the dashboard cannot drift.
//
// The two files answer different needs and are shaped differently on purpose:
//
//   XLSX — the report a Super Admin forwards to finance. Six sheets, one subject
//   each, with a title block, bold frozen headers, autofilters and real number
//   formats. Written with ExcelJS because SheetJS's community build silently
//   discards cell styling and cannot freeze panes.
//
//   CSV — one flat table with a single row schema, for Excel, pandas or Power BI.
//   It is deliberately NOT the workbook flattened: stacking six pseudo-tables with
//   their own headers into one file produces something no tool can parse and no
//   person can read.
//
// Three rules hold throughout:
//
//   · A figure that could not be established is "N/A". A figure that was looked up
//     and really is nothing is 0. Collapsing the two would turn "we could not reach
//     Stripe" into "this business collected no money".
//   · Money is a number with a currency format, never a pre-formatted "₹49,970"
//     string. A spreadsheet can sum the first and cannot sum the second.
//   · A status or error message is never a data row. An unavailable Stripe leaves
//     the Transactions sheet with its headers and no rows, and says why in the Data
//     Status sheet — it does not masquerade as a transaction.

import ExcelJS from "exceljs";
import { toCsv } from "@/lib/csv";
import type { RevenueReport, TransactionRow } from "@/lib/admin/revenueMetrics";
import { LTV_MONTHS } from "@/lib/admin/revenueMetrics";

/** Shown when a value genuinely could not be determined. Never used for a real zero. */
export const NA = "N/A";

const INR_FORMAT = '₹#,##0.00';
const COUNT_FORMAT = "#,##0";
const PERCENT_FORMAT = "0.00%";
const DATE_FORMAT = "dd mmm yyyy";

const RANGE_LABEL: Record<string, string> = {
  "3m": "Last 3 calendar months",
  "6m": "Last 6 calendar months",
  "12m": "Last 12 calendar months",
};

/** "01 Oct 2025" — the human-facing date form used across both files. */
function displayDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** "2026-09-23" — the machine-facing form, used for every CSV date. */
function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `revenue-report-12-months-2026-09-23` — the caller adds the extension. */
export function revenueReportFilename(report: RevenueReport): string {
  return `revenue-report-${report.months}-months-${isoDate(report.generatedAt)}`;
}

/** Collected total across currencies, or null when Stripe could not be read. */
function collectedTotal(report: RevenueReport): number | null {
  if (!report.collected.available) return null;
  return Object.values(report.collected.totalsByCurrency).reduce((a, b) => a + b, 0);
}

/** Where each part of the report came from, and whether it could be read. */
interface SourceStatus {
  source: string;
  status: "Available" | "Unavailable";
  details: string;
}

function dataStatuses(report: RevenueReport): SourceStatus[] {
  const stripeOk = report.collected.available;
  const stripeDetail = stripeOk
    ? `${report.collected.totalTransactions} invoice(s) created in the reporting period`
    : (report.collected.unavailableReason ?? "Stripe data could not be retrieved");

  return [
    { source: "Subscriptions", status: "Available", details: "Loaded from PostgreSQL" },
    { source: "Plans", status: "Available", details: "Loaded from PostgreSQL" },
    {
      source: "Stripe invoices",
      status: stripeOk ? "Available" : "Unavailable",
      details: stripeDetail,
    },
    {
      source: "Stripe failed payments",
      status: stripeOk ? "Available" : "Unavailable",
      details: stripeOk
        ? `${report.collected.failedTransactions} failed payment(s) in the reporting period`
        : stripeDetail,
    },
  ];
}

// ─── XLSX ────────────────────────────────────────────────────────────────────

const TITLE_FILL = "FF0B6E4F"; // the admin panel's green
const HEADER_FILL = "FFF1F5F9"; // slate-100

/** Title block at the top of every sheet, so a printed page identifies itself. */
function addTitleBlock(sheet: ExcelJS.Worksheet, report: RevenueReport, subtitle: string) {
  const title = sheet.addRow(["Super Admin Revenue Report"]);
  title.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  title.height = 22;
  sheet.mergeCells(title.number, 1, title.number, 6);
  sheet.getCell(title.number, 1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: TITLE_FILL },
  };
  sheet.getCell(title.number, 1).alignment = { vertical: "middle" };

  const context = sheet.addRow([
    `${subtitle} · ${RANGE_LABEL[report.range] ?? `${report.months} months`} · ${displayDate(report.periodStart)} – ${displayDate(report.periodEnd)} · Generated ${displayDate(report.generatedAt)}`,
  ]);
  context.font = { size: 10, color: { argb: "FF64748B" } };
  sheet.mergeCells(context.number, 1, context.number, 6);
  sheet.addRow([]);
}

/** A bold, filled, frozen header row with an autofilter over the table below it. */
function addTableHeader(sheet: ExcelJS.Worksheet, headers: string[]) {
  const row = sheet.addRow(headers);
  row.font = { bold: true };
  row.alignment = { vertical: "middle", wrapText: true };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
  });
  sheet.views = [{ state: "frozen", ySplit: row.number }];
  sheet.autoFilter = {
    from: { row: row.number, column: 1 },
    to: { row: row.number, column: headers.length },
  };
  return row.number;
}

/** A bold sub-heading inside the summary sheet. */
function addSectionHeading(sheet: ExcelJS.Worksheet, text: string) {
  const row = sheet.addRow([text]);
  row.font = { bold: true, size: 11 };
  return row;
}

/** Apply a number format to a column, leaving "N/A" strings untouched. */
function formatColumn(sheet: ExcelJS.Worksheet, column: number, format: string, fromRow: number) {
  for (let r = fromRow; r <= sheet.rowCount; r++) {
    const cell = sheet.getRow(r).getCell(column);
    if (typeof cell.value === "number" || cell.value instanceof Date) cell.numFmt = format;
  }
}

function summarySheet(workbook: ExcelJS.Workbook, report: RevenueReport) {
  const sheet = workbook.addWorksheet("Revenue Summary");
  sheet.columns = [{ width: 42 }, { width: 22 }, { width: 46 }];
  addTitleBlock(sheet, report, "Executive summary");

  const meta: [string, string][] = [
    ["Reporting period", RANGE_LABEL[report.range] ?? `${report.months} months`],
    ["Period start", displayDate(report.periodStart)],
    ["Period end", displayDate(report.periodEnd)],
    ["Generated at", `${displayDate(report.generatedAt)}, ${report.generatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`],
    ["Currency", report.contractedCurrency],
  ];
  for (const [label, value] of meta) {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { color: { argb: "FF64748B" } };
  }
  sheet.addRow([]);

  // ── Contracted: what subscriptions are priced at. Not money received. ──
  addSectionHeading(sheet, "Contracted subscription metrics");
  const contractedNote = sheet.addRow([
    "Plan prices on active subscriptions in this database. A run-rate, not cash collected.",
  ]);
  contractedNote.font = { italic: true, size: 9, color: { argb: "FF64748B" } };
  sheet.mergeCells(contractedNote.number, 1, contractedNote.number, 3);

  const contractedHeader = addTableHeader(sheet, ["Metric", "Value"]);
  const contractedRows: [string, number, string][] = [
    ["MRR (Contracted)", report.contracted.mrr, INR_FORMAT],
    ["ARR (Projected = MRR × 12)", report.contracted.arr, INR_FORMAT],
    ["ARPU (MRR ÷ active subscriptions)", report.contracted.arpu, INR_FORMAT],
    [`LTV (Projected = ARPU × ${LTV_MONTHS} months)`, report.contracted.ltv, INR_FORMAT],
    ["Active subscriptions (ACTIVE or TRIALING)", report.contracted.activeSubscriptions, COUNT_FORMAT],
  ];
  for (const [metric, value, format] of contractedRows) {
    const row = sheet.addRow([metric, value]);
    row.getCell(2).numFmt = format;
  }
  sheet.addRow([]);

  // ── Collected: money Stripe actually took. ──
  addSectionHeading(sheet, "Collected revenue");
  const collectedNote = sheet.addRow([
    report.collected.available
      ? "Stripe invoices created in the reporting period. This is money actually received."
      : "Unavailable — see the Data Status sheet. Not reported as zero.",
  ]);
  collectedNote.font = { italic: true, size: 9, color: { argb: "FF64748B" } };
  sheet.mergeCells(collectedNote.number, 1, collectedNote.number, 3);

  addTableHeader(sheet, ["Metric", "Value"]);
  const available = report.collected.available;
  const total = collectedTotal(report);
  const collectedRows: [string, number | string, string][] = [
    ["Total collected revenue", available ? (total ?? 0) : NA, INR_FORMAT],
    ["Transaction count", available ? report.collected.totalTransactions : NA, COUNT_FORMAT],
    ["Successful transactions (invoice paid)", available ? report.collected.successfulTransactions : NA, COUNT_FORMAT],
    ["Failed transactions (attempted, not paid)", available ? report.collected.failedTransactions : NA, COUNT_FORMAT],
  ];
  for (const [metric, value, format] of collectedRows) {
    const row = sheet.addRow([metric, value]);
    if (typeof value === "number") row.getCell(2).numFmt = format;
  }

  const currencies = Object.entries(report.collected.totalsByCurrency);
  if (currencies.length > 1) {
    sheet.addRow([]);
    addSectionHeading(sheet, "Collected revenue by currency");
    addTableHeader(sheet, ["Currency", "Value"]);
    for (const [currency, amount] of currencies) {
      const row = sheet.addRow([currency, amount]);
      row.getCell(2).numFmt = "#,##0.00";
    }
  }

  // The summary carries two stacked tables by design; freezing one of their
  // header rows would be arbitrary, so the pane stays at the title block.
  sheet.views = [{ state: "frozen", ySplit: contractedHeader - 3 }];
  sheet.autoFilter = undefined as unknown as ExcelJS.AutoFilter;
}

function monthlySheet(workbook: ExcelJS.Workbook, report: RevenueReport) {
  const sheet = workbook.addWorksheet("Monthly Revenue");
  sheet.columns = [{ width: 12 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 22 }, { width: 20 }, { width: 20 }];
  addTitleBlock(sheet, report, "Monthly revenue");

  const headerRow = addTableHeader(sheet, [
    "Month",
    "Month label",
    "Contracted MRR",
    "Collected revenue",
    "Successful transactions",
    "Failed transactions",
    "Active subscriptions",
  ]);

  for (const m of report.monthly) {
    sheet.addRow([
      m.key,
      m.label,
      m.contractedMrr,
      m.collectedRevenue ?? NA,
      m.successfulTransactions ?? NA,
      m.failedTransactions ?? NA,
      m.activeSubscriptions,
    ]);
  }

  formatColumn(sheet, 3, INR_FORMAT, headerRow + 1);
  formatColumn(sheet, 4, INR_FORMAT, headerRow + 1);
  formatColumn(sheet, 5, COUNT_FORMAT, headerRow + 1);
  formatColumn(sheet, 6, COUNT_FORMAT, headerRow + 1);
  formatColumn(sheet, 7, COUNT_FORMAT, headerRow + 1);
}

function plansSheet(workbook: ExcelJS.Workbook, report: RevenueReport) {
  const sheet = workbook.addWorksheet("Revenue by Plan");
  sheet.columns = [{ width: 26 }, { width: 22 }, { width: 18 }, { width: 18 }, { width: 18 }];
  addTitleBlock(sheet, report, "Revenue by plan");

  const headerRow = addTableHeader(sheet, [
    "Plan",
    "Active subscriptions",
    "Contracted MRR",
    "Collected revenue",
    "Revenue share",
  ]);

  for (const p of report.plans) {
    sheet.addRow([
      p.plan,
      p.activeSubscriptions,
      p.mrr,
      p.collectedRevenue ?? NA,
      // Share of collected revenue only. Deriving it from contracted MRR would
      // silently answer a different question than the column asks.
      p.shareOfCollected ?? NA,
    ]);
  }

  formatColumn(sheet, 2, COUNT_FORMAT, headerRow + 1);
  formatColumn(sheet, 3, INR_FORMAT, headerRow + 1);
  formatColumn(sheet, 4, INR_FORMAT, headerRow + 1);
  formatColumn(sheet, 5, PERCENT_FORMAT, headerRow + 1);
}

/** A note above a table explaining why it is empty. Never a row inside the table. */
function addEmptyNote(sheet: ExcelJS.Worksheet, text: string) {
  const row = sheet.addRow([text]);
  row.font = { italic: true, size: 9, color: { argb: "FF64748B" } };
  sheet.mergeCells(row.number, 1, row.number, 4);
}

function transactionsSheet(workbook: ExcelJS.Workbook, report: RevenueReport) {
  const sheet = workbook.addWorksheet("Transactions");
  sheet.columns = [
    { width: 30 }, { width: 18 }, { width: 16 }, { width: 28 },
    { width: 18 }, { width: 16 }, { width: 10 }, { width: 16 }, { width: 12 }, { width: 30 },
  ];
  addTitleBlock(sheet, report, "Transactions");

  if (!report.collected.available) {
    addEmptyNote(sheet, `No transaction data: ${report.collected.unavailableReason ?? "Stripe could not be queried"}. See the Data Status sheet.`);
  } else if (report.transactions.length === 0) {
    addEmptyNote(sheet, "Stripe returned no invoices for this period.");
  }

  const headerRow = addTableHeader(sheet, [
    "Transaction ID",
    "Invoice number",
    "Date",
    "Workspace",
    "Plan",
    "Amount",
    "Currency",
    "Status",
    "Provider",
    "Subscription ID",
  ]);

  // Only real invoices below the header — an error message is not a transaction.
  for (const t of report.transactions) {
    sheet.addRow([
      t.id,
      t.number ?? "",
      t.date,
      t.tenant,
      t.plan,
      t.amount,
      t.currency,
      t.status,
      t.provider,
      t.subscriptionId ?? "",
    ]);
  }

  formatColumn(sheet, 3, DATE_FORMAT, headerRow + 1);
  formatColumn(sheet, 6, "#,##0.00", headerRow + 1);
}

function failedSheet(workbook: ExcelJS.Workbook, report: RevenueReport) {
  const sheet = workbook.addWorksheet("Failed Payments");
  sheet.columns = [{ width: 30 }, { width: 16 }, { width: 28 }, { width: 16 }, { width: 10 }, { width: 18 }, { width: 46 }];
  addTitleBlock(sheet, report, "Failed payments");

  if (!report.collected.available) {
    addEmptyNote(sheet, `No payment data: ${report.collected.unavailableReason ?? "Stripe could not be queried"}. See the Data Status sheet.`);
  } else if (report.failedTransactions.length === 0) {
    addEmptyNote(sheet, "No failed payments recorded for this period.");
  }

  const headerRow = addTableHeader(sheet, [
    "Transaction ID",
    "Date",
    "Workspace",
    "Amount",
    "Currency",
    "Status",
    "Failure reason",
  ]);

  for (const t of report.failedTransactions) {
    sheet.addRow([
      t.id,
      t.date,
      t.tenant,
      t.amount,
      t.currency,
      t.status,
      // Stripe records a reason only for a finalization failure; a declined card
      // leaves none on the invoice, and inventing one would be a lie.
      t.failureReason ?? NA,
    ]);
  }

  formatColumn(sheet, 2, DATE_FORMAT, headerRow + 1);
  formatColumn(sheet, 4, "#,##0.00", headerRow + 1);
}

function dataStatusSheet(workbook: ExcelJS.Workbook, report: RevenueReport) {
  const sheet = workbook.addWorksheet("Data Status");
  sheet.columns = [{ width: 28 }, { width: 16 }, { width: 76 }];
  addTitleBlock(sheet, report, "Data sources");

  const headerRow = addTableHeader(sheet, ["Data source", "Status", "Details"]);
  for (const s of dataStatuses(report)) {
    const row = sheet.addRow([s.source, s.status, s.details]);
    row.getCell(2).font = {
      bold: true,
      color: { argb: s.status === "Available" ? "FF15803D" : "FFB91C1C" },
    };
    row.getCell(3).alignment = { wrapText: true, vertical: "top" };
  }

  sheet.addRow([]);
  const note = sheet.addRow([
    'Values marked "N/A" could not be determined from an unavailable source. A value of 0 means the source was queried successfully and the result was genuinely zero.',
  ]);
  note.font = { italic: true, size: 9, color: { argb: "FF64748B" } };
  sheet.mergeCells(note.number, 1, note.number, 3);
  void headerRow;
}

/** The whole report as a formatted .xlsx workbook. */
export async function buildRevenueWorkbook(report: RevenueReport): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "WhatsCRM";
  workbook.created = report.generatedAt;

  summarySheet(workbook, report);
  monthlySheet(workbook, report);
  plansSheet(workbook, report);
  transactionsSheet(workbook, report);
  failedSheet(workbook, report);
  dataStatusSheet(workbook, report);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

/**
 * One flat table, one row per observation — the long/tidy shape every analysis
 * tool expects.
 *
 * `Section` says what kind of row it is, `Metric` what was measured, and the
 * dimension columns (Month, Plan, Workspace, transaction ids) are filled only
 * where they apply. `Value` carries the number, or "N/A" when the source could
 * not be read. That means a reader can filter Section=Transaction and get a clean
 * transaction table, or pivot Section=Monthly Revenue by Month, without ever
 * meeting a second header row mid-file.
 */
export const CSV_COLUMNS = [
  "Section",
  "Metric",
  "Month",
  "Plan",
  "Workspace",
  "Transaction ID",
  "Invoice Number",
  "Date",
  "Status",
  "Provider",
  "Subscription ID",
  "Currency",
  "Value",
] as const;

interface CsvRow {
  section: string;
  metric?: string;
  month?: string;
  plan?: string;
  workspace?: string;
  transactionId?: string;
  invoiceNumber?: string;
  date?: string;
  status?: string;
  provider?: string;
  subscriptionId?: string;
  currency?: string;
  value?: string | number;
}

function transactionCsvRows(section: string, rows: TransactionRow[]): CsvRow[] {
  return rows.map((t) => ({
    section,
    metric: "Amount",
    plan: t.plan,
    workspace: t.tenant,
    transactionId: t.id,
    invoiceNumber: t.number ?? "",
    date: t.date.toISOString(),
    status: t.status,
    provider: t.provider,
    subscriptionId: t.subscriptionId ?? "",
    currency: t.currency,
    value: t.amount,
  }));
}

export function buildRevenueCsv(report: RevenueReport): string {
  const available = report.collected.available;
  const money = report.contractedCurrency;
  const rows: CsvRow[] = [];

  // ── Report metadata ──
  rows.push(
    { section: "Report", metric: "Report type", value: "Super Admin Revenue Report" },
    { section: "Report", metric: "Reporting period", value: RANGE_LABEL[report.range] ?? `${report.months} months` },
    { section: "Report", metric: "Period start", date: isoDate(report.periodStart), value: isoDate(report.periodStart) },
    { section: "Report", metric: "Period end", date: isoDate(report.periodEnd), value: isoDate(report.periodEnd) },
    { section: "Report", metric: "Generated at", date: report.generatedAt.toISOString(), value: report.generatedAt.toISOString() },
    { section: "Report", metric: "Subscription currency", value: money },
  );

  // ── Where each figure came from, and whether it could be read ──
  for (const s of dataStatuses(report)) {
    rows.push({ section: "Data Status", metric: s.source, status: s.status, value: s.details });
  }

  // ── Contracted run-rate (database) ──
  const contracted: [string, number][] = [
    ["MRR (Contracted)", report.contracted.mrr],
    ["ARR (Projected)", report.contracted.arr],
    ["ARPU", report.contracted.arpu],
    ["LTV (Projected)", report.contracted.ltv],
  ];
  for (const [metric, value] of contracted) {
    rows.push({ section: "Contracted Metrics", metric, currency: money, value });
  }
  rows.push({
    section: "Contracted Metrics",
    metric: "Active Subscriptions",
    value: report.contracted.activeSubscriptions,
  });

  // ── Collected revenue (Stripe) — N/A, never 0, when unreadable ──
  const total = collectedTotal(report);
  rows.push(
    { section: "Collected Revenue", metric: "Total Collected Revenue", currency: money, value: available ? (total ?? 0) : NA },
    { section: "Collected Revenue", metric: "Transaction Count", value: available ? report.collected.totalTransactions : NA },
    { section: "Collected Revenue", metric: "Successful Transactions", value: available ? report.collected.successfulTransactions : NA },
    { section: "Collected Revenue", metric: "Failed Transactions", value: available ? report.collected.failedTransactions : NA },
  );

  // ── Monthly, one row per month per measure ──
  for (const m of report.monthly) {
    rows.push(
      { section: "Monthly Revenue", metric: "Contracted MRR", month: m.key, currency: money, value: m.contractedMrr },
      { section: "Monthly Revenue", metric: "Collected Revenue", month: m.key, currency: money, value: m.collectedRevenue ?? NA },
      { section: "Monthly Revenue", metric: "Successful Transactions", month: m.key, value: m.successfulTransactions ?? NA },
      { section: "Monthly Revenue", metric: "Failed Transactions", month: m.key, value: m.failedTransactions ?? NA },
      { section: "Monthly Revenue", metric: "Active Subscriptions", month: m.key, value: m.activeSubscriptions },
    );
  }

  // ── By plan ──
  for (const p of report.plans) {
    rows.push(
      { section: "Revenue by Plan", metric: "Active Subscriptions", plan: p.plan, value: p.activeSubscriptions },
      { section: "Revenue by Plan", metric: "Contracted MRR", plan: p.plan, currency: money, value: p.mrr },
      { section: "Revenue by Plan", metric: "Collected Revenue", plan: p.plan, currency: money, value: p.collectedRevenue ?? NA },
      {
        section: "Revenue by Plan",
        metric: "Revenue Share %",
        plan: p.plan,
        value: p.shareOfCollected === null ? NA : Math.round(p.shareOfCollected * 10_000) / 100,
      },
    );
  }

  // ── Real invoices only. An unavailable Stripe contributes no rows here; it is
  //    reported in the Data Status section above. ──
  rows.push(...transactionCsvRows("Transaction", report.transactions));
  rows.push(...transactionCsvRows("Failed Payment", report.failedTransactions));

  const csv = toCsv(rows, [
    { header: "Section", value: (r) => r.section },
    { header: "Metric", value: (r) => r.metric ?? "" },
    { header: "Month", value: (r) => r.month ?? "" },
    { header: "Plan", value: (r) => r.plan ?? "" },
    { header: "Workspace", value: (r) => r.workspace ?? "" },
    { header: "Transaction ID", value: (r) => r.transactionId ?? "" },
    { header: "Invoice Number", value: (r) => r.invoiceNumber ?? "" },
    { header: "Date", value: (r) => r.date ?? "" },
    { header: "Status", value: (r) => r.status ?? "" },
    { header: "Provider", value: (r) => r.provider ?? "" },
    { header: "Subscription ID", value: (r) => r.subscriptionId ?? "" },
    { header: "Currency", value: (r) => r.currency ?? "" },
    { header: "Value", value: (r) => r.value ?? "" },
  ]);

  return csv + "\r\n";
}
