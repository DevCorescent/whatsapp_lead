// ============================================================================
// MODULE : Website CMS — stored rows ⇄ page content
// ============================================================================
//
// The pure half of the CMS: no Prisma, no Next, so the rules that decide what
// the public page shows are unit-testable.
//
//   toPublicSection   — a saved row (or nothing) → what the homepage renders.
//                       Inactive items dropped, sorted, every field normalised
//                       and filled from the defaults where the row lacks it.
//   toEditorSection   — the same row → what the admin form edits. Inactive
//                       items kept, ids kept, and a flag saying whether this is
//                       saved content or the shipped defaults.
//   sectionPayloadSchema — the zod schema a save request must pass.

import { z } from "zod";
import { emptyValue, fieldsSchema, normalizeFields, type FieldSpec } from "./fields";
import { HOME_DEFAULTS } from "./defaults";
import { CMS_SECTIONS, type PublicSection, type SectionKey } from "./sections";

export interface StoredItem {
  id: string;
  kind: string;
  sortOrder: number;
  isActive: boolean;
  data: unknown;
}

export interface StoredSection {
  isActive: boolean;
  content: unknown;
  itemKinds: string[];
  items: StoredItem[];
  updatedAt: Date;
}

export interface EditorItem {
  /** Absent on an item that has not been saved yet. */
  id?: string;
  isActive: boolean;
  data: Record<string, unknown>;
}

export interface EditorSection {
  key: SectionKey;
  isActive: boolean;
  content: Record<string, unknown>;
  items: Record<string, EditorItem[]>;
  /** "default" until the section has been saved once. */
  source: "saved" | "default";
  /** Optimistic-concurrency token: the save is refused if the row has moved on. */
  updatedAt: string | null;
}

type LooseDefaults = {
  isActive: boolean;
  content: Record<string, unknown>;
  items: Record<string, (Record<string, unknown> & { isActive?: boolean })[]>;
};

function defaultsFor(key: SectionKey): LooseDefaults {
  return HOME_DEFAULTS[key] as unknown as LooseDefaults;
}

function blank(fields: readonly FieldSpec[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field.key, emptyValue(field)]));
}

function storedItemsOf(stored: StoredSection, kind: string): StoredItem[] {
  return stored.items
    .filter((item) => item.kind === kind)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

// ─── Public ───────────────────────────────────────────────────────────────────

export function toPublicSection<K extends SectionKey>(
  key: K,
  stored: StoredSection | null,
): PublicSection<K> {
  const spec = CMS_SECTIONS[key];
  const defaults = defaultsFor(key);

  const content = stored
    ? normalizeFields(spec.fields, stored.content, defaults.content)
    : { ...defaults.content };

  const items: Record<string, Record<string, unknown>[]> = {};
  for (const collection of spec.collections) {
    const saved = stored?.itemKinds.includes(collection.kind);

    items[collection.kind] = saved
      ? storedItemsOf(stored!, collection.kind)
          .filter((item) => item.isActive)
          .map((item) => ({
            ...normalizeFields(collection.fields, item.data, blank(collection.fields)),
            id: item.id,
          }))
      : (defaults.items[collection.kind] ?? []).flatMap((item, index) => {
          if (item.isActive === false) return [];
          const { isActive: _isActive, ...data } = item;
          void _isActive;
          return [{ ...normalizeFields(collection.fields, data, blank(collection.fields)), id: `default-${collection.kind}-${index}` }];
        });
  }

  return {
    isActive: stored ? stored.isActive : defaults.isActive,
    content,
    items,
  } as unknown as PublicSection<K>;
}

// ─── Editor ───────────────────────────────────────────────────────────────────

export function toEditorSection(key: SectionKey, stored: StoredSection | null): EditorSection {
  const spec = CMS_SECTIONS[key];
  const defaults = defaultsFor(key);

  const items: Record<string, EditorItem[]> = {};
  for (const collection of spec.collections) {
    const saved = stored?.itemKinds.includes(collection.kind);

    items[collection.kind] = saved
      ? storedItemsOf(stored!, collection.kind).map((item) => ({
          id: item.id,
          isActive: item.isActive,
          data: normalizeFields(collection.fields, item.data, blank(collection.fields)),
        }))
      : (defaults.items[collection.kind] ?? []).map((item) => {
          const { isActive, ...data } = item;
          return {
            isActive: isActive !== false,
            data: normalizeFields(collection.fields, data, blank(collection.fields)),
          };
        });
  }

  return {
    key,
    isActive: stored ? stored.isActive : defaults.isActive,
    content: stored
      ? normalizeFields(spec.fields, stored.content, defaults.content)
      : normalizeFields(spec.fields, defaults.content, undefined),
    items,
    source: stored ? "saved" : "default",
    updatedAt: stored ? stored.updatedAt.toISOString() : null,
  };
}

// ─── Save payload ─────────────────────────────────────────────────────────────

export function sectionPayloadSchema(key: SectionKey) {
  const spec = CMS_SECTIONS[key];

  return z.object({
    isActive: z.boolean(),
    expectedUpdatedAt: z.string().max(40).nullable().optional(),
    content: fieldsSchema(spec.fields),
    items: z.object(
      Object.fromEntries(
        spec.collections.map((collection) => [
          collection.kind,
          z
            .array(
              z.object({
                id: z.string().max(40).optional(),
                isActive: z.boolean(),
                data: fieldsSchema(collection.fields),
              }),
            )
            .max(collection.max, `${collection.label}: at most ${collection.max} items`),
        ]),
      ),
    ),
  });
}

export type SectionPayload = {
  isActive: boolean;
  expectedUpdatedAt?: string | null;
  content: Record<string, unknown>;
  items: Record<string, { id?: string; isActive: boolean; data: Record<string, unknown> }[]>;
};

/**
 * Turn a zod issue into a sentence an admin can act on.
 *
 * The field-level messages already name the field; what they lack is *where* —
 * "Answer is required" is useless on a page with twenty questions. The path is
 * translated back through the spec into "Questions #7 · Answer is required".
 */
export function describeIssue(key: SectionKey, issue: z.core.$ZodIssue): string {
  const spec = CMS_SECTIONS[key];
  const [area, kind, index] = issue.path;

  if (area === "items" && typeof kind === "string") {
    const collection = spec.collections.find((c) => c.kind === kind);
    const where = collection ? collection.label : kind;
    return typeof index === "number" ? `${where} #${index + 1} · ${issue.message}` : `${where} · ${issue.message}`;
  }
  return issue.message;
}
