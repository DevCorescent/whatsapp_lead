"use client";

// ============================================================================
// PAGE : /segments — Customer segments
//
// Build a saved filter over contacts ("City is Delhi AND Tag is Student AND
// Status is Active"), see how many match as you type, then launch a campaign
// on it (WhatsApp) without picking contacts by hand. Segments are live:
// the audience is re-evaluated when a campaign is created.
// ============================================================================

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Filter, Loader2, Megaphone, Plus, Save, Trash2, Users, X } from "lucide-react";
import { Badge, Button, Card, EmptyState, Field, PageHeader, SkeletonRows, inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  FIELD_LABEL,
  STATUS_LABEL,
  TEXT_FIELDS,
  segmentRuleSchema,
  type SegmentRule,
} from "@/lib/segmentRules";

// ─── Types ────────────────────────────────────────────────────────────────────

type FieldKey = SegmentRule["field"];

/** A rule while it is being edited — may still be incomplete (no values yet). */
interface DraftRule {
  field: FieldKey;
  op: string;
  key?: string;
  values: string[];
}

interface SavedSegment {
  id: string;
  name: string;
  description: string | null;
  rules: SegmentRule[];
  count: number;
  updatedAt: string;
}

interface Options {
  locations: { value: string; count: number }[];
  sources: string[];
  tags: { id: string; name: string; color: string | null }[];
  stages: { id: string; name: string }[];
  customKeys: string[];
}

interface Preview {
  count: number;
  sample: {
    id: string;
    name: string | null;
    phone: string;
    location: string | null;
    optedOut: boolean;
    tags: { tag: { name: string; color: string | null } }[];
  }[];
}

const FIELDS: FieldKey[] = ["location", "tags", "status", "leadStage", "name", "company", "source", "email", "custom"];

const OPS: Record<FieldKey, { value: string; label: string }[]> = {
  name: [{ value: "is", label: "is any of" }, { value: "contains", label: "contains" }],
  location: [{ value: "is", label: "is any of" }, { value: "contains", label: "contains" }],
  company: [{ value: "is", label: "is any of" }, { value: "contains", label: "contains" }],
  source: [{ value: "is", label: "is any of" }, { value: "contains", label: "contains" }],
  email: [{ value: "is", label: "is any of" }, { value: "contains", label: "contains" }],
  tags: [
    { value: "any", label: "has any of" },
    { value: "all", label: "has all of" },
    { value: "none", label: "has none of" },
  ],
  status: [{ value: "is", label: "is any of" }],
  leadStage: [{ value: "any", label: "is any of" }],
  custom: [{ value: "is", label: "is any of" }, { value: "contains", label: "contains" }],
};

const newRule = (field: FieldKey): DraftRule => ({ field, op: OPS[field][0].value, values: [], ...(field === "custom" && { key: "" }) });

/** Comparable fingerprint of the builder, for "unsaved changes". */
const draftKey = (name: string, description: string, rules: DraftRule[]) => JSON.stringify([name.trim(), description.trim(), rules]);

/** Only complete, valid rules go to the server. */
function validRules(rules: DraftRule[]): SegmentRule[] {
  return rules.flatMap((r) => {
    const parsed = segmentRuleSchema.safeParse(r);
    return parsed.success ? [parsed.data] : [];
  });
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) throw new Error(body.error ?? "Request failed");
  return body.data as T;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

/** Filters handed over from Contacts ("Save as segment"): /segments?tag=<id>&source=<name>. */
function rulesFromQuery(params: URLSearchParams): DraftRule[] | null {
  const prefilled: DraftRule[] = [];
  const tag = params.get("tag");
  const source = params.get("source");
  if (tag) prefilled.push({ field: "tags", op: "any", values: [tag] });
  if (source) prefilled.push({ field: "source", op: "is", values: [source] });
  return prefilled.length ? prefilled : null;
}

export default function SegmentsPage() {
  return (
    <Suspense>
      <SegmentsPageInner />
    </Suspense>
  );
}

function SegmentsPageInner() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState<DraftRule[]>(() => rulesFromQuery(searchParams) ?? [newRule("location")]);
  const [error, setError] = useState<string | null>(null);
  // What the builder held when last loaded or saved — anything else is unsaved work.
  const [snapshot, setSnapshot] = useState(() => draftKey("", "", [newRule("location")]));
  const dirty = draftKey(name, description, rules) !== snapshot;

  // Leaving with unsaved filters asks first — drafts are not stored anywhere.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const { data: segments, isLoading } = useQuery<SavedSegment[]>({
    queryKey: ["segments"],
    queryFn: () => fetch("/api/segments").then((r) => json<SavedSegment[]>(r)),
  });
  const { data: options } = useQuery<Options>({
    queryKey: ["segments", "options"],
    queryFn: () => fetch("/api/segments/options").then((r) => json<Options>(r)),
  });

  // Live count — debounced so typing a city doesn't fire a request per keystroke.
  const complete = useMemo(() => validRules(rules), [rules]);
  const rulesKey = JSON.stringify(complete);
  const [debouncedKey, setDebouncedKey] = useState(rulesKey);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedKey(rulesKey), 400);
    return () => clearTimeout(t);
  }, [rulesKey]);
  const { data: preview, isFetching: previewing } = useQuery<Preview>({
    queryKey: ["segments", "preview", debouncedKey],
    queryFn: () =>
      fetch("/api/segments/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: JSON.parse(debouncedKey) }),
      }).then((r) => json<Preview>(r)),
    placeholderData: (prev) => prev,
  });

  const reset = () => {
    if (dirty && !confirm("Discard the unsaved changes?")) return;
    const fresh = [newRule("location")];
    setEditingId(null);
    setName("");
    setDescription("");
    setRules(fresh);
    setSnapshot(draftKey("", "", fresh));
    setError(null);
  };

  const load = (s: SavedSegment) => {
    if (s.id === editingId) return;
    if (dirty && !confirm("Discard the unsaved changes?")) return;
    const loaded = s.rules.length ? s.rules.map((r) => ({ ...r, values: [...r.values] })) : [newRule("location")];
    setEditingId(s.id);
    setName(s.name);
    setDescription(s.description ?? "");
    setRules(loaded);
    setSnapshot(draftKey(s.name, s.description ?? "", loaded));
    setError(null);
  };

  const save = useMutation({
    mutationFn: async () => {
      const body = JSON.stringify({ name, description: description || (editingId ? null : undefined), rules: complete });
      const res = editingId
        ? await fetch(`/api/segments/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body })
        : await fetch("/api/segments", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      return json<{ id: string }>(res);
    },
    onSuccess: (saved) => {
      setEditingId(saved.id);
      setSnapshot(draftKey(name, description, rules));
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["segments"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => fetch(`/api/segments/${id}`, { method: "DELETE" }).then((r) => json(r)),
    onSuccess: (_d, id) => {
      if (id === editingId) {
        const fresh = [newRule("location")];
        setEditingId(null);
        setName("");
        setDescription("");
        setRules(fresh);
        setSnapshot(draftKey("", "", fresh));
      }
      queryClient.invalidateQueries({ queryKey: ["segments"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const updateRule = (i: number, patch: Partial<DraftRule>) =>
    setRules((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const incomplete = rules.length - complete.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Segments"
        description="Filter contacts by city, tags, status and more — then send a WhatsApp campaign to everyone who matches."
        action={
          <Button variant="secondary" onClick={reset}>
            <Plus className="h-4 w-4" /> New segment
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Saved segments */}
        <Card className="h-fit p-3 lg:sticky lg:top-6">
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Saved segments</p>
          {!editingId && (
            <div className="mb-1 rounded-lg bg-amber-50 px-3 py-2.5 ring-1 ring-inset ring-amber-200">
              <p className="truncate text-sm font-medium text-amber-900">{name.trim() || "Untitled segment"}</p>
              <p className="mt-0.5 text-xs text-amber-700">Draft · not saved yet</p>
            </div>
          )}
          {isLoading ? (
            <SkeletonRows rows={3} />
          ) : !segments?.length ? (
            <p className="px-2 py-3 text-sm leading-relaxed text-slate-500">No saved segments yet. Give the draft a name and click <b>Save segment</b>.</p>
          ) : (
            <ul className="space-y-1">
              {segments.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => load(s)}
                    className={cn(
                      "flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition",
                      s.id === editingId ? "bg-emerald-50 text-emerald-900 ring-1 ring-inset ring-emerald-200" : "text-slate-700 hover:bg-slate-50",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{s.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {s.rules.length ? s.rules.map((r) => FIELD_LABEL[r.field]).join(" · ") : "All contacts"}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-medium tabular-nums text-slate-600 ring-1 ring-inset ring-slate-200">
                      {s.count.toLocaleString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Builder */}
        <div className="min-w-0 space-y-6">
          <Card className="space-y-6 p-4 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Segment name" htmlFor="seg-name" required>
                <input id="seg-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Delhi students" className={inputClass} />
              </Field>
              <Field label="Description" htmlFor="seg-desc">
                <input id="seg-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} placeholder="Optional" className={inputClass} />
              </Field>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-slate-700">Filters</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  A contact must match <b>every</b> filter. Inside one filter, matching <b>any</b> of the values is enough.
                </p>
              </div>
              {rules.map((rule, i) => (
                <RuleRow
                  key={i}
                  rule={rule}
                  options={options}
                  onChange={(patch) => updateRule(i, patch)}
                  onRemove={() => setRules((rs) => rs.filter((_, j) => j !== i))}
                />
              ))}
              {rules.length < 20 && (
                <button
                  type="button"
                  onClick={() => setRules((rs) => [...rs, newRule("tags")])}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-2.5 text-sm font-medium text-slate-600 transition hover:border-emerald-400 hover:bg-emerald-50/50 hover:text-emerald-700"
                >
                  <Plus className="h-4 w-4" /> Add filter
                </button>
              )}
              {rules.length === 0 && <p className="text-xs text-slate-500">No filters — every active, unblocked contact matches.</p>}
            </div>

            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

            <div className="flex flex-col gap-4 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm text-slate-600">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50">
                    <Users className="h-4 w-4 text-emerald-600" />
                  </span>
                  <span className="text-2xl font-semibold tabular-nums text-slate-900">{preview ? preview.count.toLocaleString() : "—"}</span>
                  contacts match
                  {previewing && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {incomplete > 0 ? (
                    <span className="text-amber-700">{incomplete} filter{incomplete > 1 ? "s have" : " has"} no value yet and {incomplete > 1 ? "are" : "is"} ignored.</span>
                  ) : dirty ? (
                    <span className="text-amber-700">Unsaved changes.</span>
                  ) : editingId ? (
                    "Saved. The count updates as contacts change."
                  ) : (
                    "Add filters to narrow the list."
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 [&>*]:h-10 sm:[&>*]:h-9">
                {editingId && (
                  <Button
                    variant="ghost"
                    onClick={() => confirm("Delete this segment? Campaigns already sent are not affected.") && remove.mutate(editingId)}
                    disabled={remove.isPending}
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                )}
                <Button
                  variant={editingId && !dirty ? "secondary" : "primary"}
                  onClick={() => save.mutate()}
                  disabled={!name.trim() || save.isPending || (Boolean(editingId) && !dirty)}
                  title={name.trim() ? undefined : "Enter a segment name first"}
                >
                  {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {editingId ? (dirty ? "Save changes" : "Saved") : "Save segment"}
                </Button>
                {editingId && !dirty && (
                  <Link
                    href={`/campaigns?segment=${editingId}`}
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-3.5 text-sm font-medium text-white shadow-sm shadow-emerald-600/25 transition hover:bg-emerald-700"
                  >
                    <Megaphone className="h-4 w-4" /> Create campaign
                  </Link>
                )}
              </div>
            </div>
            {!editingId && (
              <p className="-mt-2 text-right text-xs text-slate-500">
                {name.trim() ? "Save it to send a campaign to these contacts." : "Enter a segment name above to save it."}
              </p>
            )}
          </Card>

          {/* Sample */}
          <Card className="overflow-hidden">
            <p className="border-b border-slate-100 px-4 py-3.5 text-sm font-medium text-slate-700 sm:px-6">
              Preview {preview && preview.count > preview.sample.length && <span className="font-normal text-slate-500">· first {preview.sample.length}</span>}
            </p>
            {!preview ? (
              <SkeletonRows rows={4} className="p-4" />
            ) : preview.sample.length === 0 ? (
              <EmptyState icon={Filter} title="No contacts match" description="Loosen a filter or add contacts with these details." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5 font-medium sm:px-6">Name</th>
                      <th className="px-3 py-2 font-medium">Phone</th>
                      <th className="px-3 py-2 font-medium">City</th>
                      <th className="px-3 py-2 font-medium">Tags</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.sample.map((c) => (
                      <tr key={c.id}>
                        <td className="px-4 py-2.5 text-slate-800 sm:px-6">
                          {c.name || "—"}
                          {c.optedOut && <Badge className="ml-2 bg-amber-50 text-amber-700 ring-amber-600/20">opted out</Badge>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">{c.phone}</td>
                        <td className="px-3 py-2 text-slate-600">{c.location || "—"}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {c.tags.map((t) => (
                              <Badge key={t.tag.name}>{t.tag.name}</Badge>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── One filter row ───────────────────────────────────────────────────────────

function RuleRow({
  rule,
  options,
  onChange,
  onRemove,
}: {
  rule: DraftRule;
  options?: Options;
  onChange: (patch: Partial<DraftRule>) => void;
  onRemove: () => void;
}) {
  const isText = (TEXT_FIELDS as readonly string[]).includes(rule.field) || rule.field === "custom";
  const suggestions =
    rule.field === "location" ? options?.locations.map((l) => l.value) : rule.field === "source" ? options?.sources : undefined;

  const choices: { value: string; label: string }[] | null =
    rule.field === "tags"
      ? (options?.tags ?? []).map((t) => ({ value: t.id, label: t.name }))
      : rule.field === "leadStage"
        ? (options?.stages ?? []).map((s) => ({ value: s.id, label: s.name }))
        : rule.field === "status"
          ? (Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((k) => ({ value: k, label: STATUS_LABEL[k] }))
          : null;

  const toggle = (v: string) =>
    onChange({ values: rule.values.includes(v) ? rule.values.filter((x) => x !== v) : [...rule.values, v] });

  return (
    <div className="flex flex-col gap-2.5 rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-100 sm:flex-row sm:items-start">
      <div className="flex gap-2 sm:w-[360px] sm:shrink-0">
        <select
          value={rule.field}
          onChange={(e) => onChange(newRule(e.target.value as FieldKey))}
          className={cn(inputClass, "min-w-0 flex-1")}
          aria-label="Field"
        >
          {FIELDS.map((f) => (
            <option key={f} value={f}>{FIELD_LABEL[f]}</option>
          ))}
        </select>
        <select value={rule.op} onChange={(e) => onChange({ op: e.target.value })} className={cn(inputClass, "w-32 shrink-0 sm:w-36")} aria-label="Operator">
          {OPS[rule.field].map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        {rule.field === "custom" && (
          <>
            <input
              list="seg-custom-keys"
              value={rule.key ?? ""}
              onChange={(e) => onChange({ key: e.target.value })}
              placeholder="Custom field name"
              className={inputClass}
              aria-label="Custom field name"
            />
            <datalist id="seg-custom-keys">
              {options?.customKeys.map((k) => <option key={k} value={k} />)}
            </datalist>
          </>
        )}
        {choices ? (
          choices.length === 0 ? (
            <div className="flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-lg bg-white px-2 py-1.5 shadow-sm ring-1 ring-inset ring-slate-200 text-xs text-slate-500">Nothing to choose from yet.</div>
          ) : (
            <div className="flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-lg bg-white px-2 py-1.5 shadow-sm ring-1 ring-inset ring-slate-200">
              {choices.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => toggle(c.value)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition",
                    rule.values.includes(c.value)
                      ? "bg-emerald-600 text-white ring-emerald-600"
                      : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )
        ) : isText ? (
          <ValuesInput values={rule.values} onChange={(values) => onChange({ values })} suggestions={suggestions} field={rule.field} />
        ) : null}
      </div>

      <button type="button" onClick={onRemove} className="self-end rounded-md p-2 text-slate-400 hover:bg-white hover:text-rose-600 sm:self-start" aria-label="Remove filter" title="Remove filter">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Free-text values as chips: type and press Enter (or comma) to add. */
function ValuesInput({
  values,
  onChange,
  suggestions,
  field,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  suggestions?: string[];
  field: string;
}) {
  const [text, setText] = useState("");
  const listId = `seg-sugg-${field}`;
  const add = (raw: string) => {
    const v = raw.trim();
    if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase()) && values.length < 50) onChange([...values, v]);
    setText("");
  };
  return (
    <div className="flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-lg bg-white px-2 py-1.5 shadow-sm ring-1 ring-inset ring-slate-200 focus-within:ring-2 focus-within:ring-emerald-500">
      {values.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
          {v}
          <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`} className="text-emerald-600 hover:text-rose-600">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        list={suggestions?.length ? listId : undefined}
        value={text}
        onChange={(e) => {
          // Picking from the datalist fires a change with the full value — add it straight away.
          if (suggestions?.includes(e.target.value)) add(e.target.value);
          else setText(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(text);
          } else if (e.key === "Backspace" && !text && values.length) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={() => text && add(text)}
        placeholder={values.length ? "" : "Type a value and press Enter"}
        className="min-w-[140px] flex-1 border-0 bg-transparent py-0.5 text-sm outline-none placeholder:text-slate-400"
        aria-label="Values"
      />
      {suggestions?.length ? (
        <datalist id={listId}>
          {suggestions.map((s) => <option key={s} value={s} />)}
        </datalist>
      ) : null}
    </div>
  );
}
