// ============================================================================
// MODULE : CSV serialization & parsing
// ============================================================================
//
// One place for both directions of CSV so exports and imports agree on quoting
// and delimiter handling. Parsing delegates to papaparse (robust against quoted
// commas, newlines-in-fields, BOMs); serialization is a small, dependency-free
// writer since the shape we emit is always our own.

import Papa from "papaparse";

/** A single output column: a header label and how to read it off a row. */
export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/** Escape one field per RFC 4180 — quote when it contains a comma, quote or newline. */
function escapeField(raw: string | number | null | undefined): string {
  const s = raw == null ? "" : String(raw);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Serialize rows to a CSV string with a header line. */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeField(c.header)).join(",");
  const body = rows
    .map((row) => columns.map((c) => escapeField(c.value(row))).join(","))
    .join("\r\n");
  return body ? `${header}\r\n${body}` : header;
}

export interface ParsedCsv {
  /** Header names in file order, trimmed. */
  headers: string[];
  /** Each row as a header→value object. */
  rows: Record<string, string>[];
  /** Non-fatal parse issues (papaparse errors), if any. */
  errors: string[];
}

/**
 * Parse a CSV string into header-keyed rows.
 *
 * Uses papaparse with `header: true` and `skipEmptyLines`, so a trailing blank
 * line or a stray empty row never becomes a phantom record. Values are trimmed
 * and headers normalised to a stable lowercase key set by the caller.
 */
export function parseCsv(text: string): ParsedCsv {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
    transform: (v) => v.trim(),
  });

  return {
    headers: result.meta.fields ?? [],
    rows: result.data ?? [],
    errors: (result.errors ?? []).map((e) => `Row ${e.row ?? "?"}: ${e.message}`),
  };
}
