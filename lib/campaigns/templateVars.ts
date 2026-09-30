// ============================================================================
// MODULE : Campaign template variables (isomorphic, no React/Prisma)
//
// How a template's placeholders are counted, labelled, filled for a preview, and
// whether the campaign sender can fill them at all. Shared by the Campaigns modal,
// the Bulk Broadcast page and POST /api/campaigns so the three never disagree on
// what a template needs.
// ============================================================================

/** The template columns these helpers read — a subset of MessageTemplate. */
export interface TemplateShape {
  body: string;
  headerType?: string | null;
  headerContent?: string | null;
  buttons?: unknown;
}

const NAMED_RE = /\{\{([a-z_][a-z0-9_]*)\}\}/g;
const POSITIONAL_RE = /\{\{(\d+)\}\}/g;

function isNamedBody(body: string): boolean {
  return /\{\{[a-z_][a-z0-9_]*\}\}/.test(body) && !/\{\{\d+\}\}/.test(body);
}

/** How many body parameters the template needs: unique names, or the highest `{{n}}`. */
export function detectBodyVarSlots(body: string): number {
  if (isNamedBody(body)) {
    return new Set([...body.matchAll(NAMED_RE)].map((m) => m[1])).size;
  }
  const nums = [...body.matchAll(POSITIONAL_RE)].map((m) => parseInt(m[1], 10));
  return nums.length > 0 ? Math.max(...nums) : 0;
}

/** Named params ({{first_name}}) in order of first appearance; empty for positional bodies. */
export function extractBodyVarNames(body: string): string[] {
  if (!isNamedBody(body)) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const m of body.matchAll(NAMED_RE)) {
    if (!seen.has(m[1])) { seen.add(m[1]); names.push(m[1]); }
  }
  return names;
}

// ─── Per-recipient values ────────────────────────────────────────────────────

/** Mapping prefix for a spreadsheet column, e.g. "field:Subject1". */
export const FIELD_PREFIX = "field:";

/** Contact fields a variable can be mapped to. */
export const CONTACT_FIELDS = ["name", "phone", "company"] as const;

/** Everything one recipient can contribute to their message. */
export interface RecipientData {
  phone: string;
  name?: string | null;
  company?: string | null;
  /** Imported columns for this recipient (Bulk Broadcast personalisation), by column name. */
  fields?: Record<string, string> | null;
}

/**
 * The body parameters one recipient receives. Each mapping entry is a contact field
 * ("name" / "phone" / "company"), an imported column ("field:Subject1"), or literal
 * text. Used by the send path and by every preview, so a preview shows exactly what
 * is sent.
 *
 * Meta rejects empty template parameters, so a blank value becomes "-".
 */
export function resolveBodyParams(mapping: string[], r: RecipientData): string[] {
  return mapping.map((entry) => {
    let raw: string;
    if (entry.startsWith(FIELD_PREFIX)) raw = r.fields?.[entry.slice(FIELD_PREFIX.length)] ?? "";
    else if (entry === "name") raw = r.name ?? "";
    else if (entry === "phone") raw = r.phone;
    else if (entry === "company") raw = r.company ?? "";
    else raw = entry;
    // Template parameters can't contain newlines or tabs (#132018); collapse them.
    return raw.replace(/[\r\n\t]+/g, " ").replace(/ {5,}/g, "    ").trim() || "-";
  });
}

/** Substitute resolved parameter values into the body, for a preview. */
export function renderTemplateBody(body: string, values: string[]): string {
  if (isNamedBody(body)) {
    const names = extractBodyVarNames(body);
    return body.replace(NAMED_RE, (whole, name: string) => {
      const i = names.indexOf(name);
      return values[i] ?? whole;
    });
  }
  return body.replace(POSITIONAL_RE, (whole, n: string) => values[parseInt(n, 10) - 1] ?? whole);
}

/**
 * Why the campaign sender cannot deliver this template, or null when it can.
 *
 * The send worker fills media headers, body parameters and the OTP copy-code
 * button — nothing else. Meta rejects a template send whose component parameters
 * don't match the template (#132000), so a template with a variable text header,
 * a dynamic URL button or a coupon-code button would fail for every recipient.
 * Refusing it up front is better than a campaign that is 100% FAILED.
 */
export function unsupportedTemplateReason(t: TemplateShape): string | null {
  if (t.headerType === "TEXT" && /\{\{/.test(t.headerContent ?? "")) {
    return "Its header has a variable, which broadcasts can't fill yet.";
  }
  const buttons = Array.isArray(t.buttons)
    ? (t.buttons as { type?: string; url?: string; urlType?: string }[])
    : [];
  if (buttons.some((b) => b.type === "URL" && (b.urlType === "DYNAMIC" || /\{\{/.test(b.url ?? "")))) {
    return "It has a dynamic URL button, which broadcasts can't fill yet.";
  }
  if (buttons.some((b) => b.type === "COPY_CODE")) {
    return "It has a coupon-code button, which broadcasts can't fill yet.";
  }
  return null;
}
