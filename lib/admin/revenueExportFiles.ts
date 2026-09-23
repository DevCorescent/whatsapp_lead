// ============================================================================
// MODULE : Revenue report → .xlsx / .csv
// ============================================================================
//
// Turns the report built by lib/admin/revenueReport.ts into the two files the
// Revenue page offers. Nothing here recalculates anything: every number arrives
// already computed, so the workbook and the CSV cannot drift from the dashboard
// or from each other.
//
// Written with the `xlsx` package the importer already depends on. Its community
// build writes values, number formats, column widths and autofilters, and
// silently ignores cell styling — so this file uses number formats and widths for
// readability and does not pretend to emit bold or frozen headers.
//
// Money is written as a number with a currency-style format, never as a
// pre-formatted "₹49,970" string: a spreadsheet can sum the first and cannot sum
// the second.

import * as XLSX from "xlsx";
import { toCsv } from "@/lib/csv";
import type { RevenueReport, TransactionRow } from "@/lib/admin/revenueMetrics";
import { LTV_MONTHS } from "@/lib/admin/revenueMetrics";

const INR_FORMAT = '"₹"#,##0.00';
const MONEY_FORMAT = "#,##0.00";
const PERCENT_FORMAT = "0.0%";
const DATE_FORMAT = "yyyy-mm-dd hh:mm";

/** Value shown when a figure cannot be established truthfully. */
const NA = "N/A";

const RANGE_LABEL: Record<string, string> = {
  "3m": "Last 3 calendar months",
  "6m": "Last 6 calendar months",
  "12m": "Last 12 calendar months",
};

/** `revenue-report-12-months-2026-09-23` — extension added by the caller. */
export function revenueReportFilename(report: RevenueReport): string {
  const date = report.generatedAt.toISOString().slice(0, 10);
  return `revenue-report-${report.months}-months-${date}`;
}

const iso = (d: Date) => d.toISOString();

/** Collected total across currencies, or null when Stripe was unavailable. */
function collectedTotal(report: RevenueReport): number | null {
  if (!report.collected.available) return null;
  return Object.values(report.collected.totalsByCurrency).reduce((a, b) => a + b, 0);
}

// ─── XLSX ────────────────────────────────────────────────────────────────────

type Cell = string | number | Date | null;

/** Apply a number format to one column of a sheet, skipping its header row. */
function formatColumn(sheet: XLSX.WorkSheet, columnIndex: number, format: string, fromRow: number) {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  for (let row = fromRow; row <= range.e.r; row++) {
    const address = XLSX.utils.encode_cell({ r: row, c: columnIndex });
    const cell = sheet[address] as XLSX.CellObject | undefined;
    if (cell && cell.t === "n") cell.z = format;
    if (cell && cell.t === "d") cell.z = format;
  }
}

function sheetFromRows(
  rows: Cell[][],
  options: {
    widths: number[];
    /** Column index → number format, applied below the header row. */
    formats?: Record<number, string>;
    /** Row index (0-based) the table header sits on, for the autofilter. */
    headerRow?: number;
  },
): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet(rows, { cellDates: true });
  sheet["!cols"] = options.widths.map((wch) => ({ wch }));

  if (options.headerRow !== undefined) {
    const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
    const lastColumn = Math.max(0, (rows[options.headerRow]?.length ?? 1) - 1);
    sheet["!autofilter"] = {
      ref: XLSX.utils.encode_range(
        { r: options.headerRow, c: 0 },
        { r: range.e.r, c: lastColumn },
      ),
    };
    for (const [column, format] of Object.entries(options.formats ?? {})) {
      formatColumn(sheet, Number(column), format, options.headerRow + 1);
    }
  }
  return sheet;
}

function summarySheet(report: RevenueReport): XLSX.WorkSheet {
  const total = collectedTotal(report);
  const currencies = Object.entries(report.collected.totalsByCurrency);

  const rows: Cell[][] = [
    ["Super Admin Revenue Report", null],
    ["Generated at", report.generatedAt],
    ["Reporting period", RANGE_LABEL[report.range] ?? `${report.months} months`],
    ["Period start", report.periodStart],
    ["Period end", report.periodEnd],
    ["Subscription currency", report.contractedCurrency],
    [null, null],

    ["Contracted subscription metrics", "Value"],
    ["— Source: Plan prices on active subscriptions in this database. Not money received.", null],
    ["MRR (contracted, monthly)", report.contracted.mrr],
    ["ARR (projected = MRR × 12)", report.contracted.arr],
    ["ARPU (contracted MRR ÷ active subscriptions)", report.contracted.arpu],
    [`LTV (projected = ARPU × ${LTV_MONTHS} months)`, report.contracted.ltv],
    ["Active subscriptions (ACTIVE or TRIALING)", report.contracted.activeSubscriptions],
    [null, null],

    ["Collected revenue (Stripe)", "Value"],
    [
      report.collected.available
        ? "— Source: Stripe invoices created in this period. This is money actually taken."
        : `— Unavailable. ${report.collected.unavailableReason ?? ""}`,
      null,
    ],
    ["Total collected revenue", report.collected.available ? (total ?? 0) : NA],
    ["Total transactions", report.collected.available ? report.collected.totalTransactions : NA],
    [
      "Successful transactions (invoice paid)",
      report.collected.available ? report.collected.successfulTransactions : NA,
    ],
    [
      "Failed transactions (payment attempted, not paid)",
      report.collected.available ? report.collected.failedTransactions : NA,
    ],
  ];

  if (currencies.length > 1) {
    rows.push([null, null], ["Collected revenue by currency", "Value"]);
    for (const [currency, amount] of currencies) rows.push([currency, amount]);
  }

  const sheet = sheetFromRows(rows, { widths: [52, 26] });
  // Money rows carry a rupee format; the counts beside them must not.
  for (const row of [9, 10, 11, 12]) {
    const cell = sheet[XLSX.utils.encode_cell({ r: row, c: 1 })] as XLSX.CellObject | undefined;
    if (cell && cell.t === "n") cell.z = INR_FORMAT;
  }
  for (const row of [1, 3, 4]) {
    const cell = sheet[XLSX.utils.encode_cell({ r: row, c: 1 })] as XLSX.CellObject | undefined;
    if (cell && cell.t === "d") cell.z = DATE_FORMAT;
  }
  const totalCell = sheet[XLSX.utils.encode_cell({ r: 17, c: 1 })] as XLSX.CellObject | undefined;
  if (totalCell && totalCell.t === "n") totalCell.z = MONEY_FORMAT;
  return sheet;
}

function monthlySheet(report: RevenueReport): XLSX.WorkSheet {
  const header: Cell[] = [
    "Month",
    "Contracted MRR (INR)",
    "Collected revenue",
    "Successful transactions",
    "Failed transactions",
    "Active subscriptions",
  ];
  const rows: Cell[][] = [
    header,
    ...report.monthly.map((m): Cell[] => [
      m.label,
      m.contractedMrr,
      m.collectedRevenue ?? NA,
      m.successfulTransactions ?? NA,
      m.failedTransactions ?? NA,
      m.activeSubscriptions,
    ]),
  ];
  return sheetFromRows(rows, {
    widths: [12, 22, 18, 24, 20, 22],
    headerRow: 0,
    formats: { 1: INR_FORMAT, 2: MONEY_FORMAT },
  });
}

function plansSheet(report: RevenueReport): XLSX.WorkSheet {
  const rows: Cell[][] = [
    ["Plan", "Active subscriptions", "Contracted MRR (INR)", "Collected revenue", "% of collected revenue"],
    ...report.plans.map((p): Cell[] => [
      p.plan,
      p.activeSubscriptions,
      p.mrr,
      p.collectedRevenue ?? NA,
      p.shareOfCollected ?? NA,
    ]),
  ];
  if (report.plans.length === 0) {
    rows.push(["No plans with subscriptions or revenue in this period.", null, null, null, null]);
  }
  return sheetFromRows(rows, {
    widths: [24, 22, 22, 20, 22],
    headerRow: 0,
    formats: { 2: INR_FORMAT, 3: MONEY_FORMAT, 4: PERCENT_FORMAT },
  });
}

function transactionRows(rows: TransactionRow[]): Cell[][] {
  return rows.map((t): Cell[] => [
    t.id,
    t.number ?? NA,
    t.date,
    t.tenant,
    t.plan,
    t.amount,
    t.currency,
    t.status,
    t.provider,
    t.subscriptionId ?? NA,
  ]);
}

function transactionsSheet(report: RevenueReport): XLSX.WorkSheet {
  const header: Cell[] = [
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
  ];
  const body = transactionRows(report.transactions);
  const rows: Cell[][] = [header];

  if (!report.collected.available) {
    rows.push([
      `Collected revenue unavailable. ${report.collected.unavailableReason ?? ""}`,
      ...Array(9).fill(null),
    ]);
  } else if (body.length === 0) {
    rows.push(["No transactions recorded for this period.", ...Array(9).fill(null)]);
  } else {
    rows.push(...body);
  }

  return sheetFromRows(rows, {
    widths: [28, 18, 20, 26, 18, 14, 10, 16, 12, 28],
    headerRow: 0,
    formats: { 2: DATE_FORMAT, 5: MONEY_FORMAT },
  });
}

function failedSheet(report: RevenueReport): XLSX.WorkSheet {
  const header: Cell[] = [
    "Transaction ID",
    "Date",
    "Workspace",
    "Amount",
    "Currency",
    "Status",
    "Failure reason",
  ];
  const rows: Cell[][] = [header];

  if (!report.collected.available) {
    rows.push([
      `Collected revenue unavailable. ${report.collected.unavailableReason ?? ""}`,
      ...Array(6).fill(null),
    ]);
  } else if (report.failedTransactions.length === 0) {
    rows.push(["No failed payments recorded for this period.", ...Array(6).fill(null)]);
  } else {
    rows.push(
      ...report.failedTransactions.map((t): Cell[] => [
        t.id,
        t.date,
        t.tenant,
        t.amount,
        t.currency,
        t.status,
        // Stripe records a reason only for a finalization failure; a declined card
        // does not put one on the invoice, and inventing one would be a lie.
        t.failureReason ?? NA,
      ]),
    );
  }

  return sheetFromRows(rows, {
    widths: [28, 20, 26, 14, 10, 18, 44],
    headerRow: 0,
    formats: { 1: DATE_FORMAT, 3: MONEY_FORMAT },
  });
}

/** The whole report as an .xlsx buffer. */
export function buildRevenueWorkbook(report: RevenueReport): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, summarySheet(report), "Revenue Summary");
  XLSX.utils.book_append_sheet(workbook, monthlySheet(report), "Monthly Revenue");
  XLSX.utils.book_append_sheet(workbook, plansSheet(report), "Revenue by Plan");
  XLSX.utils.book_append_sheet(workbook, transactionsSheet(report), "Transactions");
  XLSX.utils.book_append_sheet(workbook, failedSheet(report), "Failed Payments");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx", cellDates: true }) as Buffer;
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

/**
 * The same report as one CSV.
 *
 * A CSV has no sheets, so the file is written as labelled sections separated by
 * blank lines: metadata, the summary, then one table per sheet. Every section
 * keeps its own header row, which is what lets a spreadsheet or a script read the
 * part it cares about.
 *
 * Amounts are plain numbers with the currency in its own column, so the file is
 * usable for analysis rather than only for reading.
 */
export function buildRevenueCsv(report: RevenueReport): string {
  const pairs = (rows: [string, string | number][]) =>
    toCsv(rows, [
      { header: "Field", value: (r) => r[0] },
      { header: "Value", value: (r) => r[1] },
    ]);

  const total = collectedTotal(report);
  const sections: string[] = [];

  sections.push(
    pairs([
      ["Report type", "Super Admin Revenue Report"],
      ["Generated at", iso(report.generatedAt)],
      ["Reporting period", RANGE_LABEL[report.range] ?? `${report.months} months`],
      ["Period start", iso(report.periodStart)],
      ["Period end", iso(report.periodEnd)],
      ["Subscription currency", report.contractedCurrency],
      [
        "Collected revenue source",
        report.collected.available
          ? "Stripe invoices"
          : `Unavailable — ${report.collected.unavailableReason ?? "unknown reason"}`,
      ],
    ]),
  );

  sections.push(
    "# Contracted subscription metrics (plan prices on active subscriptions; not money received)\r\n" +
      pairs([
        ["MRR (contracted, INR)", report.contracted.mrr],
        ["ARR (projected, INR)", report.contracted.arr],
        ["ARPU (INR)", report.contracted.arpu],
        [`LTV (projected over ${LTV_MONTHS} months, INR)`, report.contracted.ltv],
        ["Active subscriptions", report.contracted.activeSubscriptions],
      ]),
  );

  sections.push(
    "# Collected revenue (Stripe invoices; money actually taken)\r\n" +
      pairs([
        ["Total collected revenue", report.collected.available ? (total ?? 0) : NA],
        ["Total transactions", report.collected.available ? report.collected.totalTransactions : NA],
        [
          "Successful transactions",
          report.collected.available ? report.collected.successfulTransactions : NA,
        ],
        ["Failed transactions", report.collected.available ? report.collected.failedTransactions : NA],
      ]),
  );

  sections.push(
    "# Monthly revenue\r\n" +
      toCsv(report.monthly, [
        { header: "Month", value: (m) => m.key },
        { header: "Month label", value: (m) => m.label },
        { header: "Contracted MRR (INR)", value: (m) => m.contractedMrr },
        { header: "Collected revenue", value: (m) => m.collectedRevenue ?? NA },
        { header: "Successful transactions", value: (m) => m.successfulTransactions ?? NA },
        { header: "Failed transactions", value: (m) => m.failedTransactions ?? NA },
        { header: "Active subscriptions", value: (m) => m.activeSubscriptions },
      ]),
  );

  sections.push(
    "# Revenue by plan\r\n" +
      toCsv(report.plans, [
        { header: "Plan", value: (p) => p.plan },
        { header: "Active subscriptions", value: (p) => p.activeSubscriptions },
        { header: "Contracted MRR (INR)", value: (p) => p.mrr },
        { header: "Collected revenue", value: (p) => p.collectedRevenue ?? NA },
        {
          header: "% of collected revenue",
          value: (p) => (p.shareOfCollected === null ? NA : Math.round(p.shareOfCollected * 1000) / 10),
        },
      ]),
  );

  const transactionsCsv = toCsv(report.transactions, [
    { header: "Transaction ID", value: (t) => t.id },
    { header: "Invoice number", value: (t) => t.number ?? NA },
    { header: "Date", value: (t) => iso(t.date) },
    { header: "Workspace", value: (t) => t.tenant },
    { header: "Plan", value: (t) => t.plan },
    { header: "Amount", value: (t) => t.amount },
    { header: "Currency", value: (t) => t.currency },
    { header: "Status", value: (t) => t.status },
    { header: "Provider", value: (t) => t.provider },
    { header: "Subscription ID", value: (t) => t.subscriptionId ?? NA },
  ]);
  sections.push(
    "# Transactions\r\n" +
      transactionsCsv +
      (report.collected.available
        ? report.transactions.length === 0
          ? "\r\nNo transactions recorded for this period."
          : ""
        : `\r\nCollected revenue unavailable — ${report.collected.unavailableReason ?? "unknown reason"}`),
  );

  const failedCsv = toCsv(report.failedTransactions, [
    { header: "Transaction ID", value: (t) => t.id },
    { header: "Date", value: (t) => iso(t.date) },
    { header: "Workspace", value: (t) => t.tenant },
    { header: "Amount", value: (t) => t.amount },
    { header: "Currency", value: (t) => t.currency },
    { header: "Status", value: (t) => t.status },
    { header: "Failure reason", value: (t) => t.failureReason ?? NA },
  ]);
  sections.push(
    "# Failed payments\r\n" +
      failedCsv +
      (report.collected.available
        ? report.failedTransactions.length === 0
          ? "\r\nNo failed payments recorded for this period."
          : ""
        : `\r\nCollected revenue unavailable — ${report.collected.unavailableReason ?? "unknown reason"}`),
  );

  return sections.join("\r\n\r\n") + "\r\n";
}
