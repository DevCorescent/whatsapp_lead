// ============================================================================
// MODULE : Bulk import — generic primitives (isomorphic, no React/Prisma)
//
// The entity-agnostic core shared by every spreadsheet importer: column mapping,
// phone/email normalisation & checks, the validated-row shape the preview renders,
// and the request/result wire types. Contacts and Leads both build on this so the
// parser, validation model and import wizard are written once.
// ============================================================================

import { z } from "zod";

export type ImportMode = "skip" | "update";

/** Hard cap per import — the server mirrors it, so the two agree on the limit. */
export const IMPORT_MAX_ROWS = 5000;

export interface ImportField {
  key: string;
  label: string;
  required?: boolean;
  /** Lowercased header aliases used to auto-detect the column. */
  aliases: string[];
}

export type ColumnMapping = Record<string, string | null>;
export type RawRow = Record<string, unknown>;

/** Country code assumed for numbers written without one (a bare "9876543210"). */
export const DEFAULT_COUNTRY_CODE = "91";

/**
 * Length of a national number (after any trunk "0") for common country codes, so a
 * national number can be told apart from one that already carries a code. Codes not
 * listed fall back to "10 digits or fewer is national".
 */
const NATIONAL_LENGTH: Record<string, number> = {
  "1": 10, "44": 10, "61": 9, "65": 8, "91": 10, "92": 10, "94": 9,
  "880": 10, "966": 9, "971": 9, "977": 10,
};

/**
 * Normalise a phone to digits-only E.164 without the leading "+".
 *
 * This is the one normaliser for every way a number enters the system — manual
 * add/edit, spreadsheet import, bulk broadcast and blacklist — and it matches how
 * the WhatsApp webhook stores numbers (Meta's `from`, already international). So
 * "+91 98765 43210", "09876543210" and "9876543210" all become "919876543210" and
 * dedupe against each other and against a contact created by an inbound message.
 *
 * A number written internationally ("+…" or "00…") keeps its own country code.
 * Otherwise a national trunk "0" is dropped and `countryCode` is prepended when
 * what remains is exactly a national-length number. The result may still be
 * invalid; check it with `isValidPhone`.
 */
export function normalizePhone(raw: unknown, countryCode: string = DEFAULT_COUNTRY_CODE): string {
  const text = String(raw ?? "").trim();
  let digits = text.replace(/\D/g, "");
  if (!digits) return "";

  const international = text.startsWith("+") || digits.startsWith("00");
  if (digits.startsWith("00")) digits = digits.slice(2);

  const cc = countryCode.replace(/\D/g, "");
  if (!international && cc) {
    const national = digits.replace(/^0+/, "");
    const expected = NATIONAL_LENGTH[cc];
    if (expected ? national.length === expected : national.length <= 10) digits = cc + national;
  }
  return digits;
}

const emailSchema = z.string().email();

export function isValidPhone(digits: string): boolean {
  return /^[1-9]\d{9,14}$/.test(digits);
}

export function isValidEmail(email: string): boolean {
  return emailSchema.safeParse(email).success;
}

/** Parse a number cell, tolerating currency symbols, spaces and thousands separators. */
export function parseNumber(raw: unknown): number | undefined {
  const cleaned = String(raw ?? "").replace(/[^0-9.\-]/g, "");
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

/** Split a free-form tags cell ("vip; lead, 2026") into trimmed, de-duplicated names. */
export function parseTags(raw: unknown): string[] {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[,;|]/)) {
    const name = part.trim();
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      out.push(name);
    }
  }
  return out;
}

/**
 * Auto-map spreadsheet headers onto the given fields by alias, greedily and without
 * reusing a header for two fields. Returns a mapping the user can then override.
 */
export function autoMapHeaders(fields: ImportField[], headers: string[]): ColumnMapping {
  const norm = (s: string) => s.trim().toLowerCase();
  const used = new Set<string>();
  const mapping: ColumnMapping = {};
  for (const field of fields) {
    const match = headers.find(
      (h) => !used.has(h) && (norm(h) === field.key || field.aliases.includes(norm(h))),
    );
    mapping[field.key] = match ?? null;
    if (match) used.add(match);
  }
  return mapping;
}

/** Read a mapped cell as a trimmed string. */
export function cell(row: RawRow, header: string | null): string {
  if (!header) return "";
  const v = row[header];
  return v == null ? "" : String(v).trim();
}

// ─── Validated rows (entity-agnostic) ────────────────────────────────────────

export interface ValidatedRow<T> {
  /** 0-based index into the parsed data rows (excludes the header). */
  index: number;
  payload: T;
  /** What the preview's issue table shows for this row. */
  display: { primary: string; secondary?: string };
  errors: string[];
  isEmpty: boolean;
  isDuplicateInFile: boolean;
  isValid: boolean;
}

export interface ValidationSummary<T> {
  rows: ValidatedRow<T>[];
  total: number;
  valid: number;
  invalid: number;
  duplicateInFile: number;
  empty: number;
}

/** Roll a list of validated rows up into the counts the preview shows. */
export function summarize<T>(rows: ValidatedRow<T>[]): ValidationSummary<T> {
  return {
    rows,
    total: rows.length,
    valid: rows.filter((r) => r.isValid).length,
    invalid: rows.filter((r) => !r.isEmpty && !r.isDuplicateInFile && r.errors.length > 0).length,
    duplicateInFile: rows.filter((r) => r.isDuplicateInFile).length,
    empty: rows.filter((r) => r.isEmpty).length,
  };
}

// ─── Wire shapes shared with the import routes ───────────────────────────────

export interface ImportResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  /** Present on a dry run: how the batch splits against the database. */
  newCount?: number;
  existingCount?: number;
  /** `ref` identifies the offending row (a phone, or phone+title). */
  errors: { ref?: string; reason: string }[];
}
