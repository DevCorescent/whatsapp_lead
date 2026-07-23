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

/**
 * Normalise a phone to digits-only (E.164 without the leading "+").
 *
 * Matches how the WhatsApp webhook stores numbers, so an imported record dedupes
 * correctly against one created from an inbound message — both resolve to the same
 * `(phone, tenantId)` key.
 */
export function normalizePhone(raw: unknown): string {
  return String(raw ?? "").replace(/\D/g, "");
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
