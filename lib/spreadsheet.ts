// ============================================================================
// MODULE : Spreadsheet parsing (client-only)
//
// The one place the app reads .xlsx / .xls / .csv files, shared by every importer
// so the parser (and the SheetJS dependency) is never duplicated. Runs entirely in
// the browser — the server receives already-parsed rows, never raw files.
// ============================================================================

"use client";

import * as XLSX from "xlsx";
import type { RawRow } from "@/lib/import";

/**
 * Parse an uploaded workbook/CSV into ordered headers + row objects.
 *
 * `header: 1` yields rows-as-arrays so header order is preserved and duplicate/blank
 * header cells can be disambiguated — a plain object map would silently collapse them.
 */
export async function parseSpreadsheet(file: File): Promise<{ headers: string[]; rows: RawRow[] }> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { headers: [], rows: [] };

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });
  if (matrix.length === 0) return { headers: [], rows: [] };

  const seen = new Map<string, number>();
  const headers = (matrix[0] as unknown[]).map((h, i) => {
    let name = String(h ?? "").trim() || `Column ${i + 1}`;
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    if (count > 0) name = `${name} (${count + 1})`;
    return name;
  });

  const rows: RawRow[] = matrix.slice(1).map((r) => {
    const arr = r as unknown[];
    const obj: RawRow = {};
    headers.forEach((h, i) => (obj[h] = arr[i] ?? ""));
    return obj;
  });

  return { headers, rows };
}
