// ============================================================================
// MODULE : Contact import — field mapping & validation
//
// The contact-specific layer over the generic `lib/import` primitives: which columns
// a spreadsheet maps onto Contact fields, and how a row is validated. The generic
// phone/email helpers and the request/result types are re-exported so existing
// importers (the route, the hook) keep their import path unchanged.
// ============================================================================

import {
  cell,
  isValidEmail,
  isValidPhone,
  normalizePhone,
  parseTags,
  summarize,
  type ColumnMapping,
  type ImportField,
  type ImportMode,
  type RawRow,
  type ValidatedRow,
  type ValidationSummary,
} from "@/lib/import";

// Re-exported so `@/lib/contactsImport` stays a one-stop import for existing callers.
export {
  IMPORT_MAX_ROWS,
  isValidEmail,
  isValidPhone,
  normalizePhone,
  autoMapHeaders,
  type ColumnMapping,
  type ImportMode,
  type RawRow,
  type ImportResult,
} from "@/lib/import";

/** Mappable Contact columns, in display order. Only phone is strictly required. */
export const IMPORT_FIELDS: ImportField[] = [
  { key: "name", label: "Name", aliases: ["name", "full name", "fullname", "contact name", "contact"] },
  {
    key: "phone",
    label: "Phone",
    required: true,
    aliases: ["phone", "phone number", "phonenumber", "mobile", "mobile number", "whatsapp", "whatsapp number", "number", "contact number", "msisdn", "cell"],
  },
  { key: "email", label: "Email", aliases: ["email", "email address", "e-mail", "mail"] },
  { key: "company", label: "Company", aliases: ["company", "organization", "organisation", "business", "company name", "org"] },
  { key: "designation", label: "Designation", aliases: ["designation", "title", "job title", "role", "position"] },
  { key: "location", label: "Location", aliases: ["location", "city", "address", "region", "country"] },
  { key: "source", label: "Source", aliases: ["source", "lead source", "channel"] },
  { key: "notes", label: "Notes", aliases: ["notes", "note", "remark", "remarks", "comment", "comments"] },
  { key: "tags", label: "Tags", aliases: ["tags", "tag", "labels", "label"] },
];

/** One contact as POSTed to /api/contacts/import. */
export interface ImportContactPayload {
  name: string;
  phone: string;
  email?: string;
  company?: string;
  designation?: string;
  location?: string;
  source?: string;
  notes?: string;
  tags?: string[];
}

export interface ImportRequest {
  contacts: ImportContactPayload[];
  mode: ImportMode;
  /** When true, validate + report new/existing split without writing anything. */
  dryRun?: boolean;
}

/**
 * Map and validate parsed rows against a column mapping.
 *
 * Whether a phone already exists is the server's authority (the import route's dry run);
 * this owns everything knowable from the file alone: required fields, phone/email format,
 * empty rows and duplicates within the file.
 */
export function validateRows(
  rawRows: RawRow[],
  mapping: ColumnMapping,
): ValidationSummary<ImportContactPayload> {
  const seenPhones = new Set<string>();
  const rows: ValidatedRow<ImportContactPayload>[] = [];

  rawRows.forEach((raw, index) => {
    const rawName = cell(raw, mapping.name);
    const rawPhone = cell(raw, mapping.phone);
    const email = cell(raw, mapping.email);
    const phone = normalizePhone(rawPhone);

    const isEmpty = [
      rawName, rawPhone, email,
      cell(raw, mapping.company), cell(raw, mapping.designation), cell(raw, mapping.location),
      cell(raw, mapping.source), cell(raw, mapping.notes), cell(raw, mapping.tags),
    ].every((v) => v.length === 0);

    const errors: string[] = [];
    if (!isEmpty) {
      if (!rawPhone) errors.push("Phone is required");
      else if (!isValidPhone(phone)) errors.push("Invalid phone number");
      if (email && !isValidEmail(email)) errors.push("Invalid email address");
    }

    const isDuplicateInFile = !isEmpty && phone.length > 0 && seenPhones.has(phone);
    if (phone.length > 0 && isValidPhone(phone)) seenPhones.add(phone);

    const payload: ImportContactPayload = {
      name: rawName || phone,
      phone,
      email: email || undefined,
      company: cell(raw, mapping.company) || undefined,
      designation: cell(raw, mapping.designation) || undefined,
      location: cell(raw, mapping.location) || undefined,
      source: cell(raw, mapping.source) || undefined,
      notes: cell(raw, mapping.notes) || undefined,
      tags: parseTags(cell(raw, mapping.tags)),
    };

    rows.push({
      index,
      payload,
      display: { primary: payload.name, secondary: phone || undefined },
      errors,
      isEmpty,
      isDuplicateInFile,
      isValid: !isEmpty && errors.length === 0 && !isDuplicateInFile,
    });
  });

  return summarize(rows);
}
