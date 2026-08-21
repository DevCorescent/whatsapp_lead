"use client";

/**
 * The one plan form. Creating a tier, cloning one into a custom deal and editing
 * an existing one are the same twenty-odd fields, so they are the same component
 * — a second copy would be the place a newly added limit gets forgotten.
 *
 * What differs between the three is only which request it sends and which fields
 * are locked, both derived from `mode`.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Field, Modal, inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdminPlan {
  id: string;
  name: string;
  displayName: string;
  description?: string | null;
  priceMonthly: number;
  priceAnnual: number;
  maxContacts: number;
  maxMsgPerMonth: number;
  maxMsgPerDay: number;
  maxMsgPerHour: number;
  maxAgents: number;
  maxCampaigns: number;
  maxFlows: number;
  maxStorageMb: number;
  aiCredits: number;
  maxBusinesses: number;
  maxKnowledgeDocs: number;
  maxTemplates: number;
  maxQuickReplies: number;
  maxCampaignRecipients: number;
  maxUploadMb: number;
  retentionDays: number;
  allowedAiModels: string[];
  allowExport: boolean;
  isPopular: boolean;
  aiEnabled: boolean;
  ragEnabled: boolean;
  whiteLabel: boolean;
  advancedAi: boolean;
  isActive: boolean;
  sortOrder: number;
  stripePriceId?: string | null;
  visibility: "PUBLIC" | "PRIVATE";
  ownerTenantId?: string | null;
  ownerTenant?: { id: string; name: string; slug?: string } | null;
  subscribers?: number;
  _count?: { subscriptions?: number };
}

/**
 * What the form is being opened to do.
 *
 *   edit   — PATCH an existing row.
 *   create — POST a new one. `cloneFrom` prefills from another plan and tells the
 *            server to fill anything the form does not send from that plan too.
 *            `lockedTenant` fixes the owner, for the flow that starts on a
 *            tenant's own page where the answer to "who is this for" is already
 *            known and must not be changed by a stray dropdown.
 */
export type PlanFormMode =
  | { kind: "edit"; plan: AdminPlan }
  | { kind: "create"; cloneFrom?: AdminPlan; lockedTenant?: { id: string; name: string } };

interface TenantOption {
  id: string;
  name: string;
  slug: string;
}

// ─── Field vocabulary ─────────────────────────────────────────────────────────

type NumericKey =
  | "priceMonthly" | "priceAnnual" | "maxBusinesses" | "maxContacts" | "maxMsgPerMonth"
  | "maxMsgPerDay" | "maxMsgPerHour" | "maxAgents" | "maxCampaigns" | "maxFlows"
  | "maxStorageMb" | "aiCredits" | "maxKnowledgeDocs" | "maxTemplates" | "maxQuickReplies"
  | "maxCampaignRecipients" | "maxUploadMb" | "retentionDays" | "sortOrder";

/**
 * Zero is the "unlimited" sentinel for every cap below (isUnlimited in
 * lib/billing/tiers.ts), so each one says so. An admin typing 0 into a field
 * labelled "max contacts" could reasonably expect either answer, and on a custom
 * enterprise tier they will be typing it a lot.
 */
const NUMBER_FIELDS: { key: NumericKey; label: string; hint?: string; group: "price" | "cap" | "meta" }[] = [
  { key: "priceMonthly", label: "Monthly price (₹)", hint: "0 for a comped plan.", group: "price" },
  { key: "priceAnnual", label: "Annual price (₹)", hint: "0 for a comped plan.", group: "price" },

  { key: "maxBusinesses", label: "Businesses", hint: "Separate WhatsApp numbers. 0 = unlimited.", group: "cap" },
  { key: "maxContacts", label: "Contacts", hint: "0 = unlimited.", group: "cap" },
  { key: "maxAgents", label: "Agents", hint: "0 = unlimited.", group: "cap" },
  { key: "maxMsgPerMonth", label: "Messages / month", hint: "0 = unlimited.", group: "cap" },
  { key: "maxMsgPerDay", label: "Messages / day", hint: "Rolling 24h, outbound. 0 = unlimited.", group: "cap" },
  { key: "maxMsgPerHour", label: "Messages / hour", hint: "Rolling 60m, outbound. 0 = unlimited.", group: "cap" },
  { key: "maxCampaigns", label: "Campaigns / period", hint: "0 = unlimited.", group: "cap" },
  { key: "maxCampaignRecipients", label: "Recipients / campaign", hint: "One send. 0 = unlimited.", group: "cap" },
  { key: "maxFlows", label: "Chatbot flows", hint: "0 = unlimited.", group: "cap" },
  { key: "maxKnowledgeDocs", label: "Knowledge base docs", hint: "0 = unlimited.", group: "cap" },
  { key: "maxStorageMb", label: "Knowledge storage (MB)", hint: "0 = unlimited.", group: "cap" },
  { key: "aiCredits", label: "AI credits / period", hint: "0 = unlimited.", group: "cap" },
  { key: "maxTemplates", label: "Message templates", hint: "0 = unlimited.", group: "cap" },
  { key: "maxQuickReplies", label: "Quick replies", hint: "0 = unlimited.", group: "cap" },
  { key: "maxUploadMb", label: "Upload size (MB)", hint: "Per file. 0 = unlimited.", group: "cap" },

  { key: "retentionDays", label: "Message retention (days)", hint: "Deleted nightly past this. 0 = keep forever.", group: "meta" },
  { key: "sortOrder", label: "Sort order", hint: "Lower sorts first on the pricing page.", group: "meta" },
];

const TOGGLES: { key: "aiEnabled" | "ragEnabled" | "advancedAi" | "whiteLabel" | "allowExport"; label: string }[] = [
  { key: "aiEnabled", label: "AI auto-reply" },
  { key: "ragEnabled", label: "Knowledge base (RAG)" },
  { key: "advancedAi", label: "Advanced AI (lead scoring)" },
  { key: "whiteLabel", label: "White label" },
  { key: "allowExport", label: "CSV export" },
];

// ─── Form state ───────────────────────────────────────────────────────────────

type FormState = Record<NumericKey, number> & {
  displayName: string;
  description: string;
  name: string;
  allowedAiModels: string;
  stripePriceId: string;
  visibility: "PUBLIC" | "PRIVATE";
  ownerTenantId: string;
  isActive: boolean;
  isPopular: boolean;
  aiEnabled: boolean;
  ragEnabled: boolean;
  whiteLabel: boolean;
  advancedAi: boolean;
  allowExport: boolean;
};

/** A blank tier: everything off, every cap zero-as-unlimited left explicit. */
function emptyForm(): FormState {
  const numbers = Object.fromEntries(NUMBER_FIELDS.map((f) => [f.key, 0])) as Record<NumericKey, number>;
  return {
    ...numbers,
    maxBusinesses: 1,
    maxUploadMb: 10,
    maxFlows: 5,
    maxStorageMb: 1024,
    displayName: "",
    description: "",
    name: "",
    allowedAiModels: "",
    stripePriceId: "",
    visibility: "PUBLIC",
    ownerTenantId: "",
    isActive: true,
    isPopular: false,
    aiEnabled: false,
    ragEnabled: false,
    whiteLabel: false,
    advancedAi: false,
    allowExport: true,
  };
}

function formFrom(plan: AdminPlan): FormState {
  const numbers = Object.fromEntries(
    NUMBER_FIELDS.map((f) => [f.key, Number(plan[f.key] ?? 0)]),
  ) as Record<NumericKey, number>;
  return {
    ...numbers,
    displayName: plan.displayName,
    description: plan.description ?? "",
    name: plan.name,
    allowedAiModels: (plan.allowedAiModels ?? []).join(", "),
    stripePriceId: plan.stripePriceId ?? "",
    visibility: plan.visibility,
    ownerTenantId: plan.ownerTenantId ?? "",
    isActive: plan.isActive,
    isPopular: plan.isPopular,
    aiEnabled: plan.aiEnabled,
    ragEnabled: plan.ragEnabled,
    whiteLabel: plan.whiteLabel,
    advancedAi: plan.advancedAi,
    allowExport: plan.allowExport,
  };
}

/** Seed the form for whatever the modal was opened to do. */
function initialForm(mode: PlanFormMode): FormState {
  if (mode.kind === "edit") return formFrom(mode.plan);

  const base = mode.cloneFrom ? formFrom(mode.cloneFrom) : emptyForm();
  return {
    ...base,
    // A clone is a new deal, not the old one. The machine name is regenerated by
    // the server, the badge and the Stripe price belong to the plan being copied
    // rather than to the copy, and the display name must change because the card
    // it produces sits next to its source in the same list.
    name: "",
    stripePriceId: "",
    isPopular: false,
    visibility: "PRIVATE",
    displayName: mode.lockedTenant
      ? `${mode.lockedTenant.name} — custom`
      : mode.cloneFrom
        ? `${mode.cloneFrom.displayName} (custom)`
        : "",
    ownerTenantId: mode.lockedTenant?.id ?? "",
  };
}

/** Tenants offered as the owner of a custom plan. */
function useTenantOptions(enabled: boolean) {
  return useQuery<TenantOption[]>({
    queryKey: ["admin", "tenant-options"],
    enabled,
    queryFn: async () => {
      const res = await fetch("/api/admin/tenants?limit=100");
      if (!res.ok) return [];
      const json = await res.json();
      return (json.data ?? []) as TenantOption[];
    },
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PlanFormModal({
  mode,
  onClose,
  onSaved,
}: {
  /** Null closes the modal. Every non-null value opens a freshly seeded form. */
  mode: PlanFormMode | null;
  onClose: () => void;
  onSaved?: (plan: AdminPlan) => void;
}) {
  const qc = useQueryClient();

  // Re-seeded whenever a different thing is opened. Keyed on what the modal was
  // opened FOR, not just a plan id: "clone Growth" and "edit Growth" are
  // different forms over the same row and must not share leftover state.
  const seedKey =
    mode === null
      ? null
      : mode.kind === "edit"
        ? `edit:${mode.plan.id}`
        : `create:${mode.cloneFrom?.id ?? "blank"}:${mode.lockedTenant?.id ?? ""}`;

  const [openedKey, setOpenedKey] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  if (mode && seedKey !== openedKey) {
    setOpenedKey(seedKey);
    setForm(initialForm(mode));
  }

  const isPrivate = form.visibility === "PRIVATE";
  const lockedTenant = mode?.kind === "create" ? mode.lockedTenant : undefined;
  const { data: tenants = [] } = useTenantOptions(Boolean(mode) && isPrivate && !lockedTenant);

  const save = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const editing = mode?.kind === "edit" ? mode.plan : null;
      const res = await fetch(editing ? `/api/admin/plans/${editing.id}` : "/api/admin/plans", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Save failed (${res.status})`);
      return json.data as AdminPlan;
    },
    onSuccess: (plan) => {
      qc.invalidateQueries({ queryKey: ["admin", "plans"] });
      qc.invalidateQueries({ queryKey: ["admin", "tenant"] });
      onSaved?.(plan);
      onClose();
    },
  });

  const capFields = useMemo(() => NUMBER_FIELDS.filter((f) => f.group === "cap"), []);
  const priceFields = useMemo(() => NUMBER_FIELDS.filter((f) => f.group === "price"), []);
  const metaFields = useMemo(() => NUMBER_FIELDS.filter((f) => f.group === "meta"), []);

  if (!mode) return null;

  const editing = mode.kind === "edit" ? mode.plan : null;
  const cloning = mode.kind === "create" ? mode.cloneFrom : undefined;

  const setNum = (key: NumericKey) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: Number(e.target.value) }));
  const toggle = (key: keyof FormState) => () =>
    setForm((f) => ({ ...f, [key]: !f[key] }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();

    const payload: Record<string, unknown> = {
      ...Object.fromEntries(NUMBER_FIELDS.map((f) => [f.key, Number(form[f.key])])),
      displayName: form.displayName,
      description: form.description.trim() ? form.description.trim() : null,
      allowedAiModels: form.allowedAiModels.split(",").map((m) => m.trim()).filter(Boolean),
      stripePriceId: form.stripePriceId.trim() || null,
      visibility: form.visibility,
      ownerTenantId: isPrivate ? form.ownerTenantId || null : null,
      isActive: form.isActive,
      isPopular: form.isPopular,
      aiEnabled: form.aiEnabled,
      ragEnabled: form.ragEnabled,
      whiteLabel: form.whiteLabel,
      advancedAi: form.advancedAi,
      allowExport: form.allowExport,
    };

    if (!editing) {
      if (cloning) payload.cloneFrom = cloning.id;
      // Omitted for a custom tier so the server generates it. Sending "" would
      // be a value, and a value has to be unique.
      if (form.name.trim()) payload.name = form.name.trim().toUpperCase();
    }

    save.mutate(payload);
  };

  const title = editing
    ? `Edit ${editing.displayName}`
    : cloning
      ? `New plan from ${cloning.displayName}`
      : "New plan";

  const description = editing
    ? "Changes apply to new subscriptions only."
    : cloning
      ? "Every limit is copied from the source plan. Change what the deal changes."
      : "Set the limits and features this tier grants.";

  return (
    <Modal open onClose={onClose} title={title} description={description} className="max-w-3xl">
      <form onSubmit={submit} className="space-y-5">
        {/* ── Who it is for ─────────────────────────────────────────────── */}
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Display name" htmlFor="pf-displayName" required>
              <input
                id="pf-displayName"
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                required
                className={inputClass}
                placeholder="Acme Corp — Enterprise"
              />
            </Field>

            <Field label="Visibility" htmlFor="pf-visibility">
              <select
                id="pf-visibility"
                value={form.visibility}
                onChange={(e) =>
                  setForm((f) => ({ ...f, visibility: e.target.value as "PUBLIC" | "PRIVATE" }))
                }
                className={inputClass}
                disabled={Boolean(lockedTenant)}
              >
                <option value="PUBLIC">Public — listed on the pricing page</option>
                <option value="PRIVATE">Custom — assigned by you only</option>
              </select>
              <p className="mt-1 text-[11px] text-slate-500">
                {isPrivate
                  ? "Hidden from every customer. Nobody can buy it; you assign it."
                  : "Anyone can see and buy this tier."}
              </p>
            </Field>
          </div>

          {isPrivate && (
            <Field label="Belongs to" htmlFor="pf-owner">
              {lockedTenant ? (
                <input
                  id="pf-owner"
                  value={lockedTenant.name}
                  readOnly
                  className={cn(inputClass, "bg-slate-100 text-slate-600")}
                />
              ) : (
                <select
                  id="pf-owner"
                  value={form.ownerTenantId}
                  onChange={(e) => setForm((f) => ({ ...f, ownerTenantId: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">No single owner — assignable to several workspaces</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (/{t.slug})
                    </option>
                  ))}
                </select>
              )}
              <p className="mt-1 text-[11px] text-slate-500">
                An owned plan can only ever be assigned to that one workspace. Leave it unowned for a
                deal you want to reuse across several.
              </p>
            </Field>
          )}

          <Field label="Description" htmlFor="pf-description">
            <input
              id="pf-description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className={inputClass}
              placeholder="What this tier is for."
            />
          </Field>

          {!editing && !isPrivate && (
            <Field label="Machine name" htmlFor="pf-name" required>
              <input
                id="pf-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
                className={cn(inputClass, "font-mono text-xs uppercase")}
                placeholder="GROWTH_PLUS"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Uppercase, digits and underscores. Permanent — it cannot be changed later.
              </p>
            </Field>
          )}
        </div>

        {/* ── Price ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4">
          {priceFields.map((n) => (
            <Field key={n.key} label={n.label} htmlFor={`pf-${n.key}`}>
              <input
                id={`pf-${n.key}`}
                type="number"
                min={0}
                value={form[n.key]}
                onChange={setNum(n.key)}
                className={inputClass}
              />
              {n.hint && <p className="mt-1 text-[11px] text-slate-500">{n.hint}</p>}
            </Field>
          ))}
        </div>

        {/* ── Limits ────────────────────────────────────────────────────── */}
        <fieldset className="rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Limits
          </legend>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {capFields.map((n) => (
              <Field key={n.key} label={n.label} htmlFor={`pf-${n.key}`}>
                <input
                  id={`pf-${n.key}`}
                  type="number"
                  min={0}
                  value={form[n.key]}
                  onChange={setNum(n.key)}
                  className={inputClass}
                />
                {n.hint && <p className="mt-1 text-[11px] text-slate-500">{n.hint}</p>}
              </Field>
            ))}
          </div>
        </fieldset>

        {/* ── Features ──────────────────────────────────────────────────── */}
        <div className="space-y-2 rounded-lg border border-slate-200 p-3">
          {TOGGLES.map((t) => (
            <label
              key={t.key}
              className="flex cursor-pointer items-center justify-between gap-3 text-sm text-slate-700"
            >
              {t.label}
              <button
                type="button"
                role="switch"
                aria-checked={form[t.key]}
                onClick={toggle(t.key)}
                className={cn(
                  "relative h-5 w-9 shrink-0 rounded-full transition",
                  form[t.key] ? "bg-[#0B6E4F]" : "bg-slate-300",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                    form[t.key] ? "left-4.5" : "left-0.5",
                  )}
                />
              </button>
            </label>
          ))}
        </div>

        {/* ── Retention, ordering, models, Stripe ───────────────────────── */}
        <div className="grid grid-cols-2 gap-4">
          {metaFields.map((n) => (
            <Field key={n.key} label={n.label} htmlFor={`pf-${n.key}`}>
              <input
                id={`pf-${n.key}`}
                type="number"
                min={0}
                value={form[n.key]}
                onChange={setNum(n.key)}
                className={inputClass}
              />
              {n.hint && <p className="mt-1 text-[11px] text-slate-500">{n.hint}</p>}
            </Field>
          ))}
        </div>

        <Field label="Allowed AI models" htmlFor="pf-models">
          <input
            id="pf-models"
            value={form.allowedAiModels}
            onChange={(e) => setForm((f) => ({ ...f, allowedAiModels: e.target.value }))}
            placeholder="gpt-4o-mini, claude-haiku-4-5-20251001"
            className={cn(inputClass, "font-mono text-xs")}
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Comma-separated. Leave empty to allow any model.
          </p>
        </Field>

        <Field label="Stripe price ID" htmlFor="pf-stripe">
          <input
            id="pf-stripe"
            value={form.stripePriceId}
            onChange={(e) => setForm((f) => ({ ...f, stripePriceId: e.target.value }))}
            placeholder="price_1AbC…"
            className={cn(inputClass, "font-mono text-xs")}
          />
          <p className="mt-1 text-[11px] text-slate-500">
            {isPrivate
              ? "Leave empty for a plan you invoice offline — the usual case for a custom deal."
              : "Required for self-serve checkout. Without it this tier cannot be bought."}
          </p>
        </Field>

        {/* ── Flags ─────────────────────────────────────────────────────── */}
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
          <span>
            <span className="text-sm font-medium text-slate-900">Active</span>
            <span className="mt-0.5 block text-[11px] text-slate-500">
              Turn off to retire a tier. Workspaces already on it keep every limit it grants —
              it only stops being offered.
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={form.isActive}
            onClick={toggle("isActive")}
            className={cn(
              "relative h-5 w-9 shrink-0 rounded-full transition",
              form.isActive ? "bg-[#0B6E4F]" : "bg-slate-300",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                form.isActive ? "left-4.5" : "left-0.5",
              )}
            />
          </button>
        </label>

        {/* Presentation, not entitlement — kept out of the feature box above so
            it does not read as something the tier grants. Meaningless on a plan
            no customer can see, so it is not offered there. */}
        {!isPrivate && (
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-violet-200 bg-violet-50/50 p-3">
            <span>
              <span className="text-sm font-medium text-violet-900">
                Pin the &ldquo;Most Popular&rdquo; badge here
              </span>
              <span className="mt-0.5 block text-[11px] text-violet-700/80">
                Off by default, the badge goes to whichever plan has the most subscribers (Growth if
                there is no clear leader). Pin it to override that. Only one plan can hold the pin.
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={form.isPopular}
              onClick={toggle("isPopular")}
              className={cn(
                "relative h-5 w-9 shrink-0 rounded-full transition",
                form.isPopular ? "bg-violet-600" : "bg-slate-300",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                  form.isPopular ? "left-4.5" : "left-0.5",
                )}
              />
            </button>
          </label>
        )}

        {save.isError && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {(save.error as Error).message}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={save.isPending}
            className="rounded-lg bg-[#0B6E4F] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#095c42] disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : editing ? "Save changes" : "Create plan"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
