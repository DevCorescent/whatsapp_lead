"use client";

/**
 * The CMS section editor: one homepage section, its content fields and its
 * repeatable items.
 *
 * Driven entirely by lib/cms/sections.ts. The same spec validates the save on
 * the server, so the checks run here are for instant feedback, not trust.
 *
 * STATE. The form holds a local draft seeded from the server copy. It is keyed on
 * the section's `updatedAt`, so a save, a reset or a reload remounts it with the
 * fresh copy instead of syncing props into state inside an effect.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  CircleCheck,
  ExternalLink,
  Mail,
  MessageCircle,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Modal } from "@/components/ui";
import { Toggle } from "@/components/ui/Toggle";
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminPanel,
  AdminSkeleton,
  adminInputClass,
} from "@/components/admin/ui";
import { CmsIcon } from "@/components/marketing/home/cmsIcon";
import { emptyValue, type CollectionSpec, type FieldSpec } from "@/lib/cms/fields";
import { CMS_SECTIONS, CMS_SECTION_KEYS, type SectionKey } from "@/lib/cms/sections";
import {
  describeIssue,
  sectionPayloadSchema,
  type EditorItem,
  type EditorSection,
  type SectionPayload,
} from "@/lib/cms/store";
import { cn } from "@/lib/utils";
import { FieldInput, IconButton, isWideField } from "./FieldInput";

// ─── Data ─────────────────────────────────────────────────────────────────────

type RequestError = Error & { status?: number; issues?: string[] };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const error = new Error(json.error ?? `Request failed (${res.status})`) as RequestError;
    error.status = res.status;
    error.issues = Array.isArray(json.issues) ? json.issues : undefined;
    throw error;
  }
  return json.data as T;
}

const sectionQueryKey = (key: SectionKey) => ["admin", "cms", "section", key] as const;
export const SECTIONS_QUERY_KEY = ["admin", "cms", "sections"] as const;

// ─── Draft helpers ────────────────────────────────────────────────────────────

type DraftItem = EditorItem & { uid: string };

interface Draft {
  isActive: boolean;
  content: Record<string, unknown>;
  items: Record<string, DraftItem[]>;
}

type Notice = { tone: "success" | "error"; text: string } | null;

function toDraft(section: EditorSection): Draft {
  return {
    isActive: section.isActive,
    content: section.content,
    items: Object.fromEntries(
      Object.entries(section.items).map(([kind, list]) => [
        kind,
        list.map((item, index) => ({ ...item, uid: item.id ?? `${kind}-${index}` })),
      ]),
    ),
  };
}

/** Called from event handlers only, so it may be impure. */
function freshUid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `new-${crypto.randomUUID()}`
    : `new-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function blankData(fields: readonly FieldSpec[]) {
  return Object.fromEntries(fields.map((field) => [field.key, emptyValue(field)]));
}

/** Trim text and drop blank list lines — the shape the API expects. */
function cleanFields(fields: readonly FieldSpec[], data: Record<string, unknown>) {
  return Object.fromEntries(
    fields.map((field) => {
      const value = data[field.key];
      switch (field.type) {
        case "list":
          return [
            field.key,
            Array.isArray(value) ? value.map((line) => String(line).trim()).filter(Boolean) : [],
          ];
        case "links":
          return [
            field.key,
            Array.isArray(value)
              ? value.map((link) => ({
                  label: String(link?.label ?? "").trim(),
                  href: String(link?.href ?? "").trim(),
                  isActive: link?.isActive !== false,
                }))
              : [],
          ];
        case "text":
        case "textarea":
        case "url":
        case "image":
          return [field.key, typeof value === "string" ? value.trim() : ""];
        default:
          return [field.key, value];
      }
    }),
  );
}

function toPayload(key: SectionKey, draft: Draft): SectionPayload {
  const spec = CMS_SECTIONS[key];
  return {
    isActive: draft.isActive,
    content: cleanFields(spec.fields, draft.content),
    items: Object.fromEntries(
      spec.collections.map((collection: CollectionSpec) => [
        collection.kind,
        (draft.items[collection.kind] ?? []).map((item) => ({
          ...(item.id ? { id: item.id } : {}),
          isActive: item.isActive,
          data: cleanFields(collection.fields, item.data),
        })),
      ]),
    ),
  };
}

function siteHref(key: SectionKey) {
  const spec = CMS_SECTIONS[key];
  return "anchor" in spec && spec.anchor ? `/#${spec.anchor}` : "/";
}

// ─── Page shell: navigation + editor ──────────────────────────────────────────

export function CmsSectionPage({ sectionKey }: { sectionKey: SectionKey }) {
  const router = useRouter();
  const dirty = useRef(false);

  const confirmLeave = useCallback(
    () => !dirty.current || window.confirm("You have unsaved changes. Leave this section without saving?"),
    [],
  );

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-xs text-slate-500">
        <Link
          href="/admin/cms"
          onClick={(event) => {
            if (!confirmLeave()) event.preventDefault();
          }}
          className="hover:text-slate-900"
        >
          Website CMS
        </Link>
        <span className="mx-1.5 text-slate-300">/</span>
        <span>Home page</span>
        <span className="mx-1.5 text-slate-300">/</span>
        <span className="font-medium text-slate-900">{CMS_SECTIONS[sectionKey].label}</span>
      </nav>

      <div className="grid gap-5 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:items-start">
        <SectionNav
          current={sectionKey}
          confirmLeave={confirmLeave}
          onSelect={(key) => router.push(`/admin/cms/${key}`)}
        />
        <SectionEditor
          key={sectionKey}
          sectionKey={sectionKey}
          onDirtyChange={(value) => {
            dirty.current = value;
          }}
        />
      </div>
    </>
  );
}

function SectionNav({
  current,
  confirmLeave,
  onSelect,
}: {
  current: SectionKey;
  confirmLeave: () => boolean;
  onSelect: (key: SectionKey) => void;
}) {
  return (
    <>
      {/* Phones and tablets: a select, so fifteen sections do not push the form off screen. */}
      <div className="lg:hidden">
        <label htmlFor="cms-section-select" className="mb-1.5 block text-xs font-medium text-slate-500">
          Home page section
        </label>
        <select
          id="cms-section-select"
          value={current}
          onChange={(event) => {
            if (confirmLeave()) onSelect(event.target.value as SectionKey);
          }}
          className={cn(adminInputClass, "cursor-pointer")}
        >
          {CMS_SECTION_KEYS.map((key) => (
            <option key={key} value={key}>
              {CMS_SECTIONS[key].label}
            </option>
          ))}
        </select>
      </div>

      <AdminCard className="hidden p-2 lg:sticky lg:top-4 lg:block">
        <p className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Home page
        </p>
        <ul className="space-y-0.5">
          {CMS_SECTION_KEYS.map((key) => {
            const spec = CMS_SECTIONS[key];
            const active = key === current;
            return (
              <li key={key}>
                <Link
                  href={`/admin/cms/${key}`}
                  aria-current={active ? "page" : undefined}
                  onClick={(event) => {
                    if (!active && !confirmLeave()) event.preventDefault();
                  }}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm transition",
                    active
                      ? "bg-emerald-50 font-medium text-[#0B6E4F] ring-1 ring-inset ring-emerald-100"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                  )}
                >
                  <span className="truncate">{spec.label}</span>
                  {"whatsapp" in spec && spec.whatsapp && (
                    <MessageCircle aria-label="WhatsApp content" className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </AdminCard>
    </>
  );
}

// ─── Loader ───────────────────────────────────────────────────────────────────

function SectionEditor({
  sectionKey,
  onDirtyChange,
}: {
  sectionKey: SectionKey;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [notice, setNotice] = useState<Notice>(null);
  const query = useQuery({
    queryKey: sectionQueryKey(sectionKey),
    queryFn: () => request<EditorSection>(`/api/admin/cms/sections/${sectionKey}`),
    staleTime: 0,
  });

  // Success messages fade on their own; errors stay until the next action.
  useEffect(() => {
    if (notice?.tone !== "success") return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <AdminSkeleton className="h-16 w-full rounded-xl" />
        <AdminSkeleton className="h-64 w-full rounded-xl" />
        <AdminSkeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <AdminCard className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <TriangleAlert className="h-6 w-6 text-amber-500" />
        <p className="text-sm font-medium text-slate-900">This section could not be loaded</p>
        <p className="max-w-sm text-sm text-slate-500">{(query.error as Error | null)?.message}</p>
        <AdminButton variant="secondary" onClick={() => query.refetch()}>
          Try again
        </AdminButton>
      </AdminCard>
    );
  }

  return (
    <SectionForm
      key={query.data.updatedAt ?? "default"}
      section={query.data}
      notice={notice}
      onNotice={setNotice}
      onDirtyChange={onDirtyChange}
    />
  );
}

// ─── Form ─────────────────────────────────────────────────────────────────────

function SectionForm({
  section,
  notice,
  onNotice,
  onDirtyChange,
}: {
  section: EditorSection;
  notice: Notice;
  onNotice: (notice: Notice) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const key = section.key;
  const spec = CMS_SECTIONS[key];
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<Draft>(() => toDraft(section));
  const [issues, setIssues] = useState<string[]>([]);
  const [conflict, setConflict] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const baseline = useMemo(() => JSON.stringify(toPayload(key, toDraft(section))), [key, section]);
  const dirty = JSON.stringify(toPayload(key, draft)) !== baseline;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const published = (data: EditorSection, text: string) => {
    onNotice({ tone: "success", text });
    queryClient.setQueryData(sectionQueryKey(key), data);
    queryClient.invalidateQueries({ queryKey: SECTIONS_QUERY_KEY });
  };

  const save = useMutation({
    mutationFn: (payload: SectionPayload) =>
      request<EditorSection>(`/api/admin/cms/sections/${key}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => published(data, "Saved. The live website now shows these changes."),
    onError: (error: RequestError) => {
      setConflict(error.status === 409);
      setIssues(error.issues ?? [error.message]);
    },
  });

  const reset = useMutation({
    mutationFn: () =>
      request<EditorSection>(`/api/admin/cms/sections/${key}`, { method: "DELETE" }),
    onSuccess: (data) => {
      setConfirmReset(false);
      published(data, "Section restored to its default content.");
    },
    onError: (error: RequestError) => {
      setConfirmReset(false);
      onNotice({ tone: "error", text: error.message });
    },
  });

  const onSave = () => {
    const payload: SectionPayload = { ...toPayload(key, draft), expectedUpdatedAt: section.updatedAt };
    const result = sectionPayloadSchema(key).safeParse(payload);
    if (!result.success) {
      setConflict(false);
      setIssues(result.error.issues.slice(0, 10).map((issue) => describeIssue(key, issue)));
      return;
    }
    setIssues([]);
    onNotice(null);
    save.mutate(payload);
  };

  const discard = () => {
    setDraft(toDraft(section));
    setIssues([]);
    setConflict(false);
  };

  const setContent = (field: string, value: unknown) =>
    setDraft((current) => ({ ...current, content: { ...current.content, [field]: value } }));

  const setItems = (kind: string, items: DraftItem[]) =>
    setDraft((current) => ({ ...current, items: { ...current.items, [kind]: items } }));

  const busy = save.isPending || reset.isPending;

  return (
    <div className="min-w-0 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{spec.label}</h1>
            {"whatsapp" in spec && spec.whatsapp && (
              <AdminBadge tone="emerald">
                <MessageCircle className="h-3 w-3" />
                WhatsApp content
              </AdminBadge>
            )}
            <AdminBadge tone={section.source === "saved" ? "sky" : "slate"}>
              {section.source === "saved" ? "Customised" : "Default content"}
            </AdminBadge>
          </div>
          <p className="mt-1 text-sm text-slate-500">{spec.description}</p>
          {section.updatedAt && (
            <p className="mt-0.5 text-xs text-slate-400">
              Last saved {format(new Date(section.updatedAt), "d MMM yyyy, h:mm a")}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={siteHref(key)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50 hover:text-slate-900"
          >
            <ExternalLink className="h-4 w-4" />
            View on website
          </a>
          <AdminButton
            variant="secondary"
            onClick={() => setConfirmReset(true)}
            disabled={section.source === "default" || busy}
            title={section.source === "default" ? "This section already shows the default content" : undefined}
          >
            <RotateCcw className="h-4 w-4" />
            Reset section
          </AdminButton>
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className={cn(
            "flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm",
            notice.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800",
          )}
        >
          {notice.tone === "success" ? (
            <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          {notice.text}
        </div>
      )}

      {issues.length > 0 && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <p className="flex items-center gap-2 font-semibold">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            {conflict ? "Not saved — this section changed" : "Please fix the following before saving"}
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-6">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
          {conflict && (
            <AdminButton
              variant="secondary"
              size="sm"
              className="mt-2.5"
              onClick={() => queryClient.invalidateQueries({ queryKey: sectionQueryKey(key) })}
            >
              Reload latest version
            </AdminButton>
          )}
        </div>
      )}

      {/* Visibility */}
      <AdminCard className="flex items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">Show this section on the website</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Turn off to hide it for visitors. Its content is kept for later.
          </p>
        </div>
        <Toggle
          checked={draft.isActive}
          onChange={(value) => setDraft((current) => ({ ...current, isActive: value }))}
          label="Show this section on the website"
        />
      </AdminCard>

      {spec.fields.length > 0 && (
        <AdminPanel title="Content" subtitle="Headings, text and buttons">
          <FieldGrid
            fields={spec.fields}
            values={draft.content}
            onChange={setContent}
            idPrefix={`${key}-content`}
          />
        </AdminPanel>
      )}

      {spec.collections.map((collection: CollectionSpec) => (
        <CollectionEditor
          key={collection.kind}
          collection={collection}
          items={draft.items[collection.kind] ?? []}
          onChange={(items) => setItems(collection.kind, items)}
          idPrefix={`${key}-${collection.kind}`}
        />
      ))}

      {key === "newsletter" && <NewsletterSubmissions />}

      {/* Save bar — sticks to the bottom of the admin scroll area. */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            {dirty ? (
              <span className="inline-flex items-center gap-2 font-medium text-amber-700">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Unsaved changes
              </span>
            ) : (
              <span className="text-slate-500">
                No unsaved changes{section.source === "default" ? " · showing default content" : ""}
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <AdminButton variant="ghost" onClick={discard} disabled={!dirty || busy}>
              Discard
            </AdminButton>
            <AdminButton onClick={onSave} disabled={!dirty || busy}>
              <Save className="h-4 w-4" />
              {save.isPending ? "Saving…" : "Save changes"}
            </AdminButton>
          </div>
        </div>
      </div>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title={`Reset ${spec.label}?`}
        description="The website goes back to the default content for this section."
      >
        <p className="text-sm text-slate-600">
          Everything saved for this section — text, items, order and visibility — is removed. This cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <AdminButton variant="ghost" onClick={() => setConfirmReset(false)}>
            Cancel
          </AdminButton>
          <AdminButton variant="danger" disabled={reset.isPending} onClick={() => reset.mutate()}>
            {reset.isPending ? "Resetting…" : "Reset section"}
          </AdminButton>
        </div>
      </Modal>
    </div>
  );
}

// ─── Fields ───────────────────────────────────────────────────────────────────

function groupFields(fields: readonly FieldSpec[]) {
  const groups: { name?: string; fields: FieldSpec[] }[] = [];
  for (const field of fields) {
    const last = groups[groups.length - 1];
    if (last && last.name === field.group) last.fields.push(field);
    else groups.push({ name: field.group, fields: [field] });
  }
  return groups;
}

function FieldGrid({
  fields,
  values,
  onChange,
  idPrefix,
}: {
  fields: readonly FieldSpec[];
  values: Record<string, unknown>;
  onChange: (field: string, value: unknown) => void;
  idPrefix: string;
}) {
  return (
    <div className="space-y-6">
      {groupFields(fields).map((group, index) => (
        <fieldset key={`${group.name ?? "fields"}-${index}`} className="min-w-0">
          {group.name && (
            <legend className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
              {group.name.includes("WhatsApp") && <MessageCircle className="h-3.5 w-3.5 text-emerald-500" />}
              {group.name}
            </legend>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {group.fields.map((field) => (
              <div key={field.key} className={isWideField(field) ? "sm:col-span-2" : undefined}>
                <FieldInput
                  field={field}
                  value={values[field.key]}
                  onChange={(value) => onChange(field.key, value)}
                  idPrefix={idPrefix}
                />
              </div>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

// ─── Repeatable items ─────────────────────────────────────────────────────────

function itemTitle(collection: CollectionSpec, item: DraftItem, index: number) {
  const field = collection.fields.find((f) => f.key === collection.titleField);
  const raw = String(item.data[collection.titleField] ?? "").trim();
  const label = field?.type === "select" ? field.options?.find((o) => o.value === raw)?.label : raw;
  const noun = collection.itemLabel.charAt(0).toUpperCase() + collection.itemLabel.slice(1);
  return label || `${noun} ${index + 1}`;
}

function CollectionEditor({
  collection,
  items,
  onChange,
  idPrefix,
}: {
  collection: CollectionSpec;
  items: DraftItem[];
  onChange: (items: DraftItem[]) => void;
  idPrefix: string;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const hasIcon = collection.fields.some((field) => field.type === "icon");
  const shown = items.filter((item) => item.isActive).length;

  const toggleOpen = (uid: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });

  const add = () => {
    const uid = freshUid();
    onChange([...items, { uid, isActive: true, data: blankData(collection.fields) }]);
    setOpen((current) => new Set(current).add(uid));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const update = (index: number, patch: Partial<DraftItem>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  return (
    <AdminPanel
      title={collection.label}
      subtitle={`${shown} shown on website · ${items.length} of ${collection.max} items`}
      bodyClassName="space-y-2.5 p-3 sm:p-4"
      action={
        <AdminButton size="sm" variant="secondary" onClick={add} disabled={items.length >= collection.max}>
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Add {collection.itemLabel}</span>
          <span className="sm:hidden">Add</span>
        </AdminButton>
      }
    >
      {collection.description && <p className="text-xs text-slate-500">{collection.description}</p>}

      {items.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
          No items yet. Use “Add {collection.itemLabel}” to create one.
        </p>
      )}

      {items.map((item, index) => {
        const isOpen = open.has(item.uid);
        return (
          <div
            key={item.uid}
            className={cn(
              "rounded-xl border bg-white transition",
              item.isActive ? "border-slate-200" : "border-dashed border-slate-300 bg-slate-50/70",
            )}
          >
            <div className="flex items-center gap-1.5 px-2 py-1.5 sm:gap-2 sm:px-3">
              <button
                type="button"
                onClick={() => toggleOpen(item.uid)}
                aria-expanded={isOpen}
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B6E4F]"
              >
                <span className="nums flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[11px] font-semibold text-slate-500">
                  {index + 1}
                </span>
                {hasIcon && (
                  <CmsIcon
                    name={String(item.data.icon ?? "")}
                    className="hidden h-4 w-4 shrink-0 text-[#0B6E4F] sm:block"
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-sm font-medium", item.isActive ? "text-slate-900" : "text-slate-500")}>
                    {itemTitle(collection, item, index)}
                  </span>
                  {!item.isActive && <span className="block text-[11px] text-slate-500">Hidden on website</span>}
                </span>
                <ChevronDown
                  className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", isOpen && "rotate-180")}
                />
              </button>

              <div className="flex shrink-0 items-center">
                <Toggle
                  size="sm"
                  checked={item.isActive}
                  onChange={(value) => update(index, { isActive: value })}
                  label={`Show ${collection.itemLabel} ${index + 1} on the website`}
                  className="mr-1"
                />
                <IconButton label="Move up" onClick={() => move(index, -1)} disabled={index === 0}>
                  <ArrowUp className="h-4 w-4" />
                </IconButton>
                <IconButton label="Move down" onClick={() => move(index, 1)} disabled={index === items.length - 1}>
                  <ArrowDown className="h-4 w-4" />
                </IconButton>
                <IconButton label={`Remove ${collection.itemLabel}`} onClick={() => onChange(items.filter((_, i) => i !== index))} danger>
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>
            </div>

            {isOpen && (
              <div className="border-t border-slate-100 p-3 sm:p-4">
                <FieldGrid
                  fields={collection.fields}
                  values={item.data}
                  onChange={(field, value) => update(index, { data: { ...item.data, [field]: value } })}
                  idPrefix={`${idPrefix}-${item.uid}`}
                />
              </div>
            )}
          </div>
        );
      })}
    </AdminPanel>
  );
}

// ─── Newsletter submissions ───────────────────────────────────────────────────

type Subscribers = {
  total: number;
  recent: { id: string; email: string; source: string; createdAt: string }[];
};

function NewsletterSubmissions() {
  const query = useQuery({
    queryKey: ["admin", "cms", "newsletter"],
    queryFn: () => request<Subscribers>("/api/admin/cms/newsletter"),
  });

  return (
    <AdminPanel
      title="Newsletter sign-ups"
      subtitle={query.data ? `${query.data.total.toLocaleString("en-IN")} total · latest 50 shown` : "Addresses from the website form"}
      bodyClassName="p-0"
    >
      {query.isLoading ? (
        <div className="p-4">
          <AdminSkeleton className="h-24 w-full" />
        </div>
      ) : query.isError ? (
        <p className="px-4 py-6 text-sm text-rose-600">{(query.error as Error).message}</p>
      ) : !query.data?.recent.length ? (
        <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-slate-500">
          <Mail className="h-4 w-4" />
          No sign-ups yet.
        </p>
      ) : (
        <ul className="scrollbar-slim max-h-80 divide-y divide-slate-100 overflow-y-auto">
          {query.data.recent.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 px-4 py-2.5 text-sm">
              <span className="min-w-0 truncate font-medium text-slate-800">{row.email}</span>
              <span className="text-xs text-slate-500">{format(new Date(row.createdAt), "d MMM yyyy, h:mm a")}</span>
            </li>
          ))}
        </ul>
      )}
    </AdminPanel>
  );
}
