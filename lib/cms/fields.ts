// ============================================================================
// MODULE : Website CMS — field vocabulary
// ============================================================================
//
// Every editable value on the marketing site is one of these field types. A
// section is described once, as a list of FieldSpecs (lib/cms/sections.ts), and
// that one description produces three things that would otherwise drift apart:
//
//   • the TypeScript shape the public components render    (FieldsShape)
//   • the zod schema every admin write is validated against (fieldsSchema)
//   • the form the admin edits it with                      (components/admin/cms)
//
// No React and no Prisma in here, so the same rules run in the API route, the
// public loader and the tests.

import { z } from "zod";
import { CMS_ICON_NAMES, isCmsIconName } from "./icons";

export type FieldType =
  | "text"
  | "textarea"
  | "url"
  | "image"
  | "number"
  | "boolean"
  | "icon"
  | "select"
  | "list"
  | "links";

export interface FieldOption {
  readonly value: string;
  readonly label: string;
}

export interface FieldSpec {
  readonly key: string;
  readonly type: FieldType;
  readonly label: string;
  readonly hint?: string;
  readonly required?: boolean;
  /** Characters for text, the ceiling for a number, entries for a list. */
  readonly max?: number;
  readonly placeholder?: string;
  /** Sub-heading the admin form groups consecutive fields under. */
  readonly group?: string;
  readonly options?: readonly FieldOption[];
}

export interface CollectionSpec {
  readonly kind: string;
  readonly label: string;
  readonly description?: string;
  /** Singular noun for the add button — "Add step". */
  readonly itemLabel: string;
  /** Field whose value titles a collapsed item in the admin. */
  readonly titleField: string;
  readonly max: number;
  readonly fields: readonly FieldSpec[];
}

export interface SectionSpec {
  readonly label: string;
  readonly description: string;
  /** Marks sections carrying WhatsApp conversation or product copy. */
  readonly whatsapp?: boolean;
  /** Homepage anchor, used by the admin's "view on site" link. */
  readonly anchor?: string;
  readonly fields: readonly FieldSpec[];
  readonly collections: readonly CollectionSpec[];
}

/** One link inside a `links` field — a footer column entry. */
export interface LinkEntry {
  label: string;
  href: string;
  isActive: boolean;
}

// ─── Derived types ────────────────────────────────────────────────────────────

type FieldValue<F extends FieldSpec> = F["type"] extends "number"
  ? number
  : F["type"] extends "boolean"
    ? boolean
    : F["type"] extends "list"
      ? string[]
      : F["type"] extends "links"
        ? LinkEntry[]
        : string;

/** The object a list of field specs describes, keyed by each field's `key`. */
export type FieldsShape<Fs extends readonly FieldSpec[]> = {
  [F in Fs[number] as F["key"]]: FieldValue<F>;
};

// ─── Links ────────────────────────────────────────────────────────────────────

const UNSAFE_CHARS = "\\s<>\"'`";

const HREF_PATTERNS = [
  // Site-relative: /pricing, /register?plan=GROWTH, /#faq. Not //host, which a
  // browser treats as another origin.
  new RegExp(`^/(?!/)[^${UNSAFE_CHARS}]*$`),
  /^#[A-Za-z0-9_-]*$/,
  new RegExp(`^https?://[^${UNSAFE_CHARS}]+$`, "i"),
  new RegExp(`^mailto:[^${UNSAFE_CHARS}]+$`, "i"),
  /^tel:\+?[0-9 ()-]{3,}$/i,
];

const IMAGE_PATTERNS = [
  new RegExp(`^https://[^${UNSAFE_CHARS}]+$`, "i"),
  new RegExp(`^/(?!/)[^${UNSAFE_CHARS}]+$`),
];

/**
 * Whether a string is safe to render as an `href`.
 *
 * An allow-list rather than a block-list: `javascript:`, `data:` and anything a
 * future browser decides to treat as executable are refused because they are not
 * one of the five shapes a marketing link can legitimately take.
 */
export function isSafeHref(value: string): boolean {
  return value.length <= 500 && HREF_PATTERNS.some((pattern) => pattern.test(value));
}

/** Images must be https or site-relative — an http image is blocked as mixed content. */
export function isSafeImageUrl(value: string): boolean {
  return value.length <= 500 && IMAGE_PATTERNS.some((pattern) => pattern.test(value));
}

/** External links open in a new tab; links within this site do not. */
export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

// ─── Validation (server) ──────────────────────────────────────────────────────

const DEFAULT_TEXT_MAX = 160;
const DEFAULT_TEXTAREA_MAX = 600;
const LINK_HINT = "use a path like /pricing, an anchor like #faq, or a full https:// link";

function textSchema(field: FieldSpec, max: number) {
  const base = z.string().trim().max(max, `${field.label} must be ${max} characters or fewer`);
  return field.required ? base.min(1, `${field.label} is required`) : base;
}

export function fieldSchema(field: FieldSpec): z.ZodType {
  switch (field.type) {
    case "text":
      return textSchema(field, field.max ?? DEFAULT_TEXT_MAX);
    case "textarea":
      return textSchema(field, field.max ?? DEFAULT_TEXTAREA_MAX);
    case "url":
      return z
        .string()
        .trim()
        .refine((value) => value !== "" || !field.required, { message: `${field.label} is required` })
        .refine((value) => value === "" || isSafeHref(value), { message: `${field.label}: ${LINK_HINT}` });
    case "image":
      return z
        .string()
        .trim()
        .refine((value) => (value === "" ? !field.required : isSafeImageUrl(value)), {
          message: `${field.label} must be an https:// image URL or a path like /logo.png`,
        });
    case "number": {
      const max = field.max ?? 10_000_000;
      return z
        .number({ message: `${field.label} must be a number` })
        .finite()
        .min(0, `${field.label} cannot be negative`)
        .max(max, `${field.label} must be at most ${max}`);
    }
    case "boolean":
      return z.boolean();
    case "icon":
      return z.enum(CMS_ICON_NAMES, { message: `${field.label}: choose an icon from the list` });
    case "select": {
      const values = (field.options ?? []).map((option) => option.value);
      return z.string().refine((value) => values.includes(value), {
        message: `${field.label}: choose one of the listed options`,
      });
    }
    case "list": {
      const max = field.max ?? 20;
      return z
        .array(z.string().trim().min(1).max(200, `${field.label}: each line must be 200 characters or fewer`))
        .max(max, `${field.label}: at most ${max} entries`);
    }
    case "links": {
      const max = field.max ?? 20;
      return z
        .array(
          z.object({
            label: z.string().trim().min(1, "Every link needs a label").max(60),
            href: z.string().trim().refine(isSafeHref, { message: `Link URL: ${LINK_HINT}` }),
            isActive: z.boolean(),
          }),
        )
        .max(max, `${field.label}: at most ${max} links`);
    }
  }
}

export function fieldsSchema(fields: readonly FieldSpec[]) {
  return z.object(Object.fromEntries(fields.map((field) => [field.key, fieldSchema(field)])));
}

// ─── Normalisation (render) ───────────────────────────────────────────────────

/** The value a brand-new item starts with. */
export function emptyValue(field: FieldSpec): unknown {
  switch (field.type) {
    case "number":
      return 0;
    case "boolean":
      return false;
    case "icon":
      return "Sparkles";
    case "select":
      return field.options?.[0]?.value ?? "";
    case "list":
    case "links":
      return [];
    default:
      return "";
  }
}

/**
 * Read one stored value back, or fall back when it is the wrong shape.
 *
 * Everything written through the admin API has already been validated, so on the
 * happy path this is a pass-through. It exists for the rows that were not: a
 * column edited by hand, or a spec that changed a field's type after content was
 * saved. Unsafe links are dropped here as well as refused at write time — the
 * page must never render a `javascript:` href whatever is in the table.
 */
export function normalizeValue(field: FieldSpec, raw: unknown, fallback: unknown): unknown {
  switch (field.type) {
    case "text":
    case "textarea":
      return typeof raw === "string" ? raw : fallback;
    case "url":
      return typeof raw === "string" && (raw === "" || isSafeHref(raw)) ? raw : fallback;
    case "image":
      return typeof raw === "string" && (raw === "" || isSafeImageUrl(raw)) ? raw : fallback;
    case "number":
      return typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
    case "boolean":
      return typeof raw === "boolean" ? raw : fallback;
    case "icon":
      return isCmsIconName(raw) ? raw : fallback;
    case "select":
      return typeof raw === "string" && (field.options ?? []).some((option) => option.value === raw)
        ? raw
        : fallback;
    case "list":
      return Array.isArray(raw)
        ? raw.filter((entry): entry is string => typeof entry === "string")
        : fallback;
    case "links":
      if (!Array.isArray(raw)) return fallback;
      return raw.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const { label, href, isActive } = entry as Record<string, unknown>;
        if (typeof label !== "string" || typeof href !== "string" || !isSafeHref(href)) return [];
        return [{ label, href, isActive: isActive !== false }];
      });
  }
}

/** Normalise a whole object against its specs, field by field. */
export function normalizeFields(
  fields: readonly FieldSpec[],
  raw: unknown,
  fallback: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(
    fields.map((field) => [
      field.key,
      normalizeValue(field, source[field.key], fallback?.[field.key] ?? emptyValue(field)),
    ]),
  );
}
