// ============================================================================
// MODULE : Bulk broadcast — pasted-number parsing (isomorphic, no React/Prisma)
//
// Turns whatever a user pastes ("+91 98765 43210", "09876543210", "9876543210,
// 9123456789") into the digits-only E.164 form the rest of the app stores and
// Meta accepts. The page runs it on every keystroke to show counts; the campaigns
// route runs it again on the way in, because the server is the authority on who
// gets messaged.
// ============================================================================

import { DEFAULT_COUNTRY_CODE, IMPORT_MAX_ROWS, isValidPhone, normalizePhone } from "@/lib/import";

export { DEFAULT_COUNTRY_CODE };

/** Most numbers one broadcast accepts — the same ceiling as a spreadsheet import. */
export const BROADCAST_MAX_NUMBERS = IMPORT_MAX_ROWS;

/**
 * Split pasted text into one entry per number. Newlines, commas, semicolons and
 * tabs separate entries; spaces do not, since "+91 98765 43210" is one number.
 */
export function splitNumberInput(text: string): string[] {
  return text
    .split(/[\n\r,;\t]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type NormalizedNumber =
  | { ok: true; phone: string }
  | { ok: false; reason: string };

/**
 * Normalise one pasted entry with the shared `normalizePhone` (so a broadcast
 * recipient dedupes against saved contacts and the blacklist), explaining why when
 * the entry is not a phone number.
 */
export function normalizeBroadcastNumber(raw: string, countryCode: string): NormalizedNumber {
  const text = raw.trim();
  // Excel shows long numbers as "9.19877E+11" unless the column is Text; the digits
  // after the precision cut-off are gone, so there is nothing to recover.
  if (/^\d(\.\d+)?e\+?\d+$/i.test(text)) {
    return { ok: false, reason: "Scientific notation — format the column as Text in Excel" };
  }
  if (/[^\d\s+\-().]/.test(text)) return { ok: false, reason: "Contains letters or symbols" };

  const digits = normalizePhone(text, countryCode);
  if (!digits) return { ok: false, reason: "No digits" };

  if (digits.length < 10) return { ok: false, reason: "Too short" };
  if (digits.length > 15) return { ok: false, reason: "Too long" };
  if (!isValidPhone(digits)) return { ok: false, reason: "Not a valid phone number" };
  return { ok: true, phone: digits };
}

export interface NumberAnalysis {
  /** Non-empty entries pasted. */
  total: number;
  /** Unique normalised numbers, in first-seen order. */
  valid: string[];
  /** Entries that could not be read as a phone number. */
  invalid: { raw: string; reason: string }[];
  /** Valid entries that repeat an earlier one once normalised. */
  duplicates: number;
}

/**
 * Validate and de-duplicate a list of entries. Duplicates are judged on the
 * normalised form, so "+91 98765 43210" and "9876543210" count as one number.
 */
export function analyzeNumbers(entries: string[], countryCode: string): NumberAnalysis {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: { raw: string; reason: string }[] = [];
  let duplicates = 0;

  for (const raw of entries) {
    const result = normalizeBroadcastNumber(raw, countryCode);
    if (!result.ok) {
      invalid.push({ raw, reason: result.reason });
    } else if (seen.has(result.phone)) {
      duplicates += 1;
    } else {
      seen.add(result.phone);
      valid.push(result.phone);
    }
  }

  return { total: entries.length, valid, invalid, duplicates };
}
