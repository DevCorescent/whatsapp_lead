// ============================================================================
// ROUTE  : /api/admin/revenue/export
// GET    - The platform revenue report as .xlsx or .csv.
//
// ACCESS - SUPER_ADMIN only, checked here on the server. The buttons on the
//          Revenue page are a convenience, never the control: this endpoint is
//          reachable directly, and platform-wide financial data is exactly the
//          kind that must not depend on a hidden button.
//
// Query:  format = xlsx | csv          (required, validated against a fixed list)
//         range  = 3m | 6m | 12m       (or period = 3 | 6 | 12)
//
// Both parameters are matched against closed sets — nothing from the query string
// ever reaches a database field, a file path or a sheet name.
//
// Every figure comes from lib/admin/revenueReport.ts, the same module the Revenue
// dashboard reads, so the download always agrees with the screen it came from.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loadRevenueReport, parseRevenueRange } from "@/lib/admin/revenueReport";
import { buildRevenueCsv, buildRevenueWorkbook, revenueReportFilename } from "@/lib/admin/revenueExportFiles";

const FORMATS = ["xlsx", "csv"] as const;
type ExportFormat = (typeof FORMATS)[number];

const CONTENT_TYPE: Record<ExportFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8",
};

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);

  const formatParam = (searchParams.get("format") ?? "").trim().toLowerCase();
  if (!(FORMATS as readonly string[]).includes(formatParam)) {
    return NextResponse.json(
      { success: false, error: `format must be one of: ${FORMATS.join(", ")}` },
      { status: 400 },
    );
  }
  const format = formatParam as ExportFormat;

  const range = parseRevenueRange(searchParams.get("range") ?? searchParams.get("period"));
  if (!range) {
    return NextResponse.json(
      { success: false, error: "range must be one of: 3m, 6m, 12m" },
      { status: 400 },
    );
  }

  try {
    const report = await loadRevenueReport(range);
    const filename = `${revenueReportFilename(report)}.${format}`;

    // A BOM so Excel opens the UTF-8 CSV with tenant names intact rather than
    // as mojibake — the file is otherwise plain UTF-8 for every other reader.
    const body =
      format === "csv"
        ? Buffer.from("﻿" + buildRevenueCsv(report), "utf8")
        : await buildRevenueWorkbook(report);

    console.log("[admin/revenue/export] Report generated", {
      userId: session.user.id,
      format,
      range,
      months: report.months,
      transactions: report.collected.totalTransactions,
      collectedAvailable: report.collected.available,
    });

    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        "Content-Type": CONTENT_TYPE[format],
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[admin/revenue/export] Failed", {
      reason: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json(
      { success: false, error: "Could not generate the revenue report." },
      { status: 500 },
    );
  }
}
