"use client";

/**
 * Plan management (SUPER_ADMIN).
 * Data: GET /api/admin/plans (live) · PATCH /api/admin/plans/[id] (TODO [SHALMON] — 501).
 * If the DB has no plans seeded yet the cards fall back to the catalogue defaults.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, Minus, Pencil, Rocket, Sparkles, Users, X, Zap } from "lucide-react";
import { Field, Modal, inputClass } from "@/components/ui";
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminPageHeader,
  AdminPanel,
  AdminSkeleton,
  AdminTable,
  planTone,
  tdClass,
  thClass,
} from "@/components/admin/ui";
import { cn, formatCompact, formatCurrency } from "@/lib/utils";

// ─── Types + data ─────────────────────────────────────────────────────────────

interface Plan {
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
  subscribers?: number;
  _count?: { subscriptions?: number };
}

const FEATURES: { key: keyof Plan; label: string }[] = [
  { key: "aiEnabled", label: "AI auto-reply" },
  { key: "ragEnabled", label: "Knowledge base (RAG)" },
  { key: "advancedAi", label: "Advanced AI (lead scoring)" },
  { key: "whiteLabel", label: "White label" },
  { key: "allowExport", label: "CSV export" },
];

const LIMITS: { key: keyof Plan; label: string }[] = [
  { key: "maxBusinesses", label: "Businesses" },
  { key: "maxContacts", label: "Contacts" },
  { key: "maxMsgPerMonth", label: "Messages / month" },
  { key: "maxMsgPerDay", label: "Messages / day" },
  { key: "maxMsgPerHour", label: "Messages / hour" },
  { key: "maxAgents", label: "Agents" },
  { key: "maxCampaigns", label: "Campaigns" },
  { key: "maxFlows", label: "Chatbot flows" },
  { key: "maxKnowledgeDocs", label: "Knowledge base docs" },
  { key: "maxTemplates", label: "Message templates" },
  { key: "maxQuickReplies", label: "Quick replies" },
  { key: "maxCampaignRecipients", label: "Recipients / campaign" },
  { key: "maxUploadMb", label: "Upload size (MB)" },
];

/** Tier icon, keyed off the plan name — gives each card visual hierarchy. */
const TIER_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  STARTER: Zap,
  GROWTH: Rocket,
  ENTERPRISE: Building2,
};

/** TODO [SHALMON]: only used when the plans table is empty (pre-seed). */
const FALLBACK_PLANS: Plan[] = [
  {
    id: "starter",
    name: "STARTER",
    displayName: "Starter",
    description: "For solo founders getting their first leads on WhatsApp.",
    priceMonthly: 999,
    priceAnnual: 9590,
    maxContacts: 1000,
    maxMsgPerMonth: 5000,
    maxMsgPerDay: 500,
    maxMsgPerHour: 100,
    maxAgents: 3,
    maxCampaigns: 5,
    maxFlows: 3,
    maxBusinesses: 1,
    maxKnowledgeDocs: 10,
    maxTemplates: 10,
    maxQuickReplies: 20,
    maxCampaignRecipients: 500,
    maxUploadMb: 5,
    retentionDays: 90,
    allowedAiModels: [],
    allowExport: false,
    isPopular: false,
    aiEnabled: false,
    ragEnabled: false,
    whiteLabel: false,
    advancedAi: false,
    isActive: true,
    subscribers: 0,
  },
  {
    id: "growth",
    name: "GROWTH",
    displayName: "Growth",
    description: "For scaling sales teams that live in the inbox.",
    priceMonthly: 2999,
    priceAnnual: 28790,
    maxContacts: 10000,
    maxMsgPerMonth: 50000,
    maxMsgPerDay: 5000,
    maxMsgPerHour: 750,
    maxAgents: 10,
    maxCampaigns: 50,
    maxFlows: 15,
    maxBusinesses: 3,
    maxKnowledgeDocs: 100,
    maxTemplates: 50,
    maxQuickReplies: 100,
    maxCampaignRecipients: 5000,
    maxUploadMb: 10,
    retentionDays: 365,
    allowedAiModels: [],
    allowExport: true,
    isPopular: false,
    aiEnabled: true,
    ragEnabled: true,
    whiteLabel: false,
    advancedAi: false,
    isActive: true,
    subscribers: 0,
  },
  {
    id: "enterprise",
    name: "ENTERPRISE",
    displayName: "Enterprise",
    description: "Unlimited scale, white label and dedicated support.",
    priceMonthly: 9999,
    priceAnnual: 95990,
    maxContacts: 1000000,
    maxMsgPerMonth: 1000000,
    maxMsgPerDay: 0,
    maxMsgPerHour: 0,
    maxAgents: 100,
    maxCampaigns: 500,
    maxFlows: 100,
    maxBusinesses: 25,
    maxKnowledgeDocs: 0,
    maxTemplates: 0,
    maxQuickReplies: 0,
    maxCampaignRecipients: 0,
    maxUploadMb: 50,
    retentionDays: 0,
    allowedAiModels: [],
    allowExport: true,
    isPopular: false,
    aiEnabled: true,
    ragEnabled: true,
    whiteLabel: true,
    advancedAi: true,
    isActive: true,
    subscribers: 0,
  },
];

function usePlans() {
  return useQuery<Plan[]>({
    queryKey: ["admin", "plans"],
    queryFn: async () => {
      const res = await fetch("/api/admin/plans");
      if (!res.ok) throw new Error(`Failed to load plans (${res.status})`);
      const json = await res.json();
      const rows = json.data ?? json;
      return (Array.isArray(rows) ? rows : []) as Plan[];
    },
    retry: false,
  });
}

function useUpdatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Record<string, unknown>) => {
      const res = await fetch(`/api/admin/plans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Update failed (${res.status})`);
      return json;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "plans"] }),
  });
}

const subscribersOf = (p: Plan) => p.subscribers ?? p._count?.subscriptions ?? 0;

/** Tier the badge falls back to when the subscriber numbers do not pick a winner. */
const DEFAULT_POPULAR = "GROWTH";

/**
 * Which plan wears the "Most Popular" ribbon.
 *
 * Resolved in this order:
 *
 *   1. An explicit pin (Plan.isPopular). The escape hatch for when the numbers
 *      point at a tier you would rather not advertise — the cheapest plan
 *      usually has the most subscribers, which is exactly the one a pricing
 *      page should not be steering people toward.
 *   2. The plan with the most subscribers, when there is a single clear leader.
 *   3. Growth.
 *
 * A tie at the top counts as "no winner" rather than picking whichever happened
 * to sort first: the badge would then flip between two cards on unrelated
 * re-renders, and "most popular" would be saying something untrue about both.
 * An all-zero table is the same case — nothing is popular yet.
 */
function popularPlanId(plans: Plan[]): string | null {
  if (plans.length === 0) return null;

  const pinned = plans.find((p) => p.isPopular);
  if (pinned) return pinned.id;

  const top = Math.max(...plans.map(subscribersOf));
  const leaders = plans.filter((p) => subscribersOf(p) === top);
  if (top > 0 && leaders.length === 1) return leaders[0].id;

  const fallback = plans.find((p) => p.name.toUpperCase() === DEFAULT_POPULAR);
  return fallback?.id ?? null;
}

/**
 * Zero and below is the "unlimited" sentinel the enforcement code reads (see
 * isUnlimited in lib/billing/tiers.ts), so it must not render as a literal "0" —
 * a card promising "0 messages / hour" describes the opposite of what that plan
 * actually grants.
 */
const limitLabel = (v: number) =>
  v <= 0 || v >= 1_000_000 ? "Unlimited" : formatCompact(v);

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPlansPage() {
  const { data, isLoading } = usePlans();
  const [editing, setEditing] = useState<Plan | null>(null);

  const plans = data && data.length > 0 ? data : FALLBACK_PLANS;

  // Resolved once across the whole set, not per card — "most" is a question
  // about every plan at once, and asking it inside the map would let two cards
  // each conclude they were the answer.
  const popularId = popularPlanId(plans);

  return (
    <>
      <AdminPageHeader
        title="Plans"
        description="Pricing, limits and feature gates for every subscription tier."
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <AdminSkeleton key={i} className="h-96 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {plans.map((plan) => {
            const popular = plan.id === popularId;
            const TierIcon = TIER_ICON[plan.name.toUpperCase()] ?? Sparkles;
            return (
              <AdminCard
                key={plan.id}
                className={cn(
                  "relative flex flex-col p-6",
                  popular && "border-2 border-violet-600",
                )}
              >
                {popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-violet-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white shadow-md">
                    Most Popular
                  </span>
                )}

                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-[#0B6E4F]">
                      <TierIcon className="h-4.5 w-4.5" />
                    </span>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">{plan.displayName}</h3>
                      <p className="mt-1 text-xs text-slate-500">{plan.description ?? "—"}</p>
                    </div>
                  </div>
                  <AdminBadge tone={plan.isActive ? "emerald" : "slate"}>
                    {plan.isActive ? "Active" : "Hidden"}
                  </AdminBadge>
                </div>

                <p className="mt-5 flex items-baseline gap-1">
                  <span className="text-3xl font-bold tracking-tight text-slate-900">
                    {formatCurrency(plan.priceMonthly)}
                  </span>
                  <span className="text-sm text-slate-500">/mo</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatCurrency(plan.priceAnnual)} billed annually
                </p>

                <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <Users className="h-4 w-4 text-[#0B6E4F]" />
                  <span className="text-sm text-slate-900">
                    {subscribersOf(plan).toLocaleString("en-IN")}
                  </span>
                  <span className="text-xs text-slate-500">subscribers</span>
                </div>

                <ul className="mt-5 space-y-2 border-t border-slate-200 pt-5 text-sm">
                  {LIMITS.map((l) => (
                    <li key={String(l.key)} className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">{l.label}</span>
                      <span className="font-medium text-slate-900">
                        {limitLabel(Number(plan[l.key] ?? 0))}
                      </span>
                    </li>
                  ))}
                </ul>

                <ul className="mt-5 space-y-2 border-t border-slate-200 pt-5 text-sm">
                  {FEATURES.map((f) => {
                    const on = Boolean(plan[f.key]);
                    return (
                      <li key={String(f.key)} className="flex items-center gap-2">
                        {on ? (
                          <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                        ) : (
                          <X className="h-4 w-4 shrink-0 text-slate-300" />
                        )}
                        <span className={on ? "text-slate-900" : "text-slate-400 line-through"}>
                          {f.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                <AdminButton
                  variant={popular ? "primary" : "secondary"}
                  className="mt-6 w-full"
                  onClick={() => setEditing(plan)}
                >
                  <Pencil className="h-4 w-4" />
                  Edit plan
                </AdminButton>
              </AdminCard>
            );
          })}
        </div>
      )}

      {/* Comparison table */}
      {/* <AdminPanel
        title="Plan comparison"
        subtitle="All plans × limits × features"
        className="mt-6"
        bodyClassName="p-0"
        action={<Sparkles className="h-4 w-4 text-[#0B6E4F]" />}
      >
        <AdminTable>
          <thead className="border-b border-slate-200 bg-[#FAFAFA]">
            <tr>
              <th className={thClass}>Capability</th>
              {plans.map((p) => (
                <th key={p.id} className={cn(thClass, "text-center")}>
                  <AdminBadge tone={planTone(p.name)}>{p.displayName}</AdminBadge>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            <tr>
              <td className={cn(tdClass, "font-medium text-slate-900")}>Price / month</td>
              {plans.map((p) => (
                <td key={p.id} className={cn(tdClass, "text-center text-slate-900")}>
                  {formatCurrency(p.priceMonthly)}
                </td>
              ))}
            </tr>
            {LIMITS.map((l) => (
              <tr key={String(l.key)}>
                <td className={cn(tdClass, "font-medium text-slate-900")}>{l.label}</td>
                {plans.map((p) => (
                  <td key={p.id} className={cn(tdClass, "text-center")}>
                    {limitLabel(Number(p[l.key] ?? 0))}
                  </td>
                ))}
              </tr>
            ))}
            {FEATURES.map((f) => (
              <tr key={String(f.key)}>
                <td className={cn(tdClass, "font-medium text-slate-900")}>{f.label}</td>
                {plans.map((p) => (
                  <td key={p.id} className={tdClass}>
                    <div className="flex justify-center">
                      {p[f.key] ? (
                        <Check className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Minus className="h-4 w-4 text-slate-300" />
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className={cn(tdClass, "font-medium text-slate-900")}>Subscribers</td>
              {plans.map((p) => (
                <td key={p.id} className={cn(tdClass, "text-center text-slate-900")}>
                  {subscribersOf(p).toLocaleString("en-IN")}
                </td>
              ))}
            </tr>
          </tbody>
        </AdminTable>
      </AdminPanel> */}

      <EditPlanModal plan={editing} onClose={() => setEditing(null)} />
    </>
  );
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

type PlanForm = {
  displayName: string;
  priceMonthly: number;
  priceAnnual: number;
  maxContacts: number;
  maxMsgPerMonth: number;
  maxMsgPerDay: number;
  maxMsgPerHour: number;
  maxAgents: number;
  maxCampaigns: number;
  maxFlows: number;
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
};

function EditPlanModal({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const update = useUpdatePlan();
  const [form, setForm] = useState<PlanForm | null>(null);

  // Reset the form whenever a different plan is opened.
  const [openedId, setOpenedId] = useState<string | null>(null);
  if (plan && openedId !== plan.id) {
    setOpenedId(plan.id);
    setForm({
      displayName: plan.displayName,
      priceMonthly: plan.priceMonthly,
      priceAnnual: plan.priceAnnual,
      maxContacts: plan.maxContacts,
      maxMsgPerMonth: plan.maxMsgPerMonth,
      maxMsgPerDay: plan.maxMsgPerDay ?? 0,
      maxMsgPerHour: plan.maxMsgPerHour ?? 0,
      maxAgents: plan.maxAgents,
      maxCampaigns: plan.maxCampaigns,
      maxFlows: plan.maxFlows,
      maxBusinesses: plan.maxBusinesses ?? 1,
      maxKnowledgeDocs: plan.maxKnowledgeDocs ?? 0,
      maxTemplates: plan.maxTemplates ?? 0,
      maxQuickReplies: plan.maxQuickReplies ?? 0,
      maxCampaignRecipients: plan.maxCampaignRecipients ?? 0,
      maxUploadMb: plan.maxUploadMb ?? 10,
      retentionDays: plan.retentionDays ?? 0,
      allowedAiModels: plan.allowedAiModels ?? [],
      allowExport: plan.allowExport ?? true,
      isPopular: plan.isPopular ?? false,
      aiEnabled: plan.aiEnabled,
      ragEnabled: plan.ragEnabled,
      whiteLabel: plan.whiteLabel,
      advancedAi: plan.advancedAi,
    });
  }

  if (!plan || !form) {
    return <Modal open={false} onClose={onClose} title="Edit plan">{null}</Modal>;
  }

  const setNum = (key: keyof PlanForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => (f ? { ...f, [key]: Number(e.target.value) } : f));

  const toggle = (key: keyof PlanForm) => () =>
    setForm((f) => (f ? { ...f, [key]: !f[key] } : f));

  // `hint` is set on every field whose 0 means unlimited rather than none, so an
  // admin typing 0 knows which of the two they are choosing before they save.
  const numberFields: { key: keyof PlanForm; label: string; hint?: string }[] = [
    { key: "priceMonthly", label: "Monthly price (₹)" },
    { key: "priceAnnual", label: "Annual price (₹)" },
    { key: "maxBusinesses", label: "Max businesses", hint: "Separate WhatsApp numbers. 0 = unlimited." },
    { key: "maxContacts", label: "Max contacts" },
    { key: "maxMsgPerMonth", label: "Max messages / month" },
    { key: "maxMsgPerDay", label: "Max messages / day", hint: "Rolling 24h, outbound only. 0 = unlimited." },
    { key: "maxMsgPerHour", label: "Max messages / hour", hint: "Rolling 60m, outbound only. 0 = unlimited." },
    { key: "maxAgents", label: "Max agents" },
    { key: "maxCampaigns", label: "Max campaigns" },
    { key: "maxFlows", label: "Max chatbot flows" },
    { key: "maxKnowledgeDocs", label: "Max knowledge base docs", hint: "PDFs, docs and URLs. 0 = unlimited." },
    { key: "maxTemplates", label: "Max message templates", hint: "0 = unlimited." },
    { key: "maxQuickReplies", label: "Max quick replies", hint: "0 = unlimited." },
    {
      key: "maxCampaignRecipients",
      label: "Max recipients / campaign",
      hint: "Audience of a single send. 0 = unlimited.",
    },
    { key: "maxUploadMb", label: "Max upload size (MB)", hint: "Per file. 0 = unlimited." },
    {
      key: "retentionDays",
      label: "Message retention (days)",
      hint: "Older messages are deleted nightly. 0 = keep forever.",
    },
  ];

  const toggles: { key: keyof PlanForm; label: string }[] = [
    { key: "aiEnabled", label: "AI auto-reply" },
    { key: "ragEnabled", label: "Knowledge base (RAG)" },
    { key: "advancedAi", label: "Advanced AI" },
    { key: "whiteLabel", label: "White label" },
    { key: "allowExport", label: "CSV export" },
  ];

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${plan.displayName}`}
      description="Changes apply to new subscriptions only."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate({ id: plan.id, ...form }, { onSuccess: onClose });
        }}
        className="space-y-4"
      >
        <Field label="Display name" htmlFor="p-name" required>
          <input
            id="p-name"
            value={form.displayName}
            onChange={(e) => setForm((f) => (f ? { ...f, displayName: e.target.value } : f))}
            required
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          {numberFields.map((n) => (
            <Field key={String(n.key)} label={n.label} htmlFor={`p-${String(n.key)}`}>
              <input
                id={`p-${String(n.key)}`}
                type="number"
                min={0}
                value={Number(form[n.key])}
                onChange={setNum(n.key)}
                className={inputClass}
              />
              {n.hint && <p className="mt-1 text-[11px] text-slate-500">{n.hint}</p>}
            </Field>
          ))}
        </div>

        <Field label="Allowed AI models" htmlFor="p-models">
          <input
            id="p-models"
            value={form.allowedAiModels.join(", ")}
            onChange={(e) =>
              setForm((f) =>
                f
                  ? {
                      ...f,
                      // Split on save rather than on every keystroke, so a
                      // half-typed name is not turned into an entry the moment
                      // the admin reaches for the comma.
                      allowedAiModels: e.target.value
                        .split(",")
                        .map((m) => m.trim())
                        .filter(Boolean),
                    }
                  : f,
              )
            }
            placeholder="gpt-4o-mini, claude-haiku-4-5-20251001"
            className={cn(inputClass, "font-mono text-xs")}
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Comma-separated. Leave empty to allow any model.
          </p>
        </Field>

        {/* Presentation, not entitlement — kept out of the feature box below so
            it does not read as something the tier grants. */}
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-violet-200 bg-violet-50/50 p-3">
          <span>
            <span className="text-sm font-medium text-violet-900">
              Pin the &ldquo;Most Popular&rdquo; badge here
            </span>
            <span className="mt-0.5 block text-[11px] text-violet-700/80">
              Off by default, the badge goes to whichever plan has the most subscribers
              (Growth if there is no clear leader). Pin it to override that. Only one plan
              can hold the pin.
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

        <div className="space-y-2 rounded-lg border border-slate-200 p-3">
          {toggles.map((t) => (
            <label
              key={String(t.key)}
              className="flex cursor-pointer items-center justify-between gap-3 text-sm text-slate-700"
            >
              {t.label}
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(form[t.key])}
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

        {update.isError && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {(update.error as Error).message}
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
            disabled={update.isPending}
            className="rounded-lg bg-[#0B6E4F] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#095c42] disabled:opacity-50"
          >
            {update.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}