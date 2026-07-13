"use client";

/**
 * Plan management (SUPER_ADMIN).
 * Data: GET /api/admin/plans (live) · PATCH /api/admin/plans/[id] (TODO [SHALMON] — 501).
 * If the DB has no plans seeded yet the cards fall back to the catalogue defaults.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Minus, Pencil, Sparkles, Users, X } from "lucide-react";
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
  maxAgents: number;
  maxCampaigns: number;
  maxFlows: number;
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
];

const LIMITS: { key: keyof Plan; label: string }[] = [
  { key: "maxContacts", label: "Contacts" },
  { key: "maxMsgPerMonth", label: "Messages / month" },
  { key: "maxAgents", label: "Agents" },
  { key: "maxCampaigns", label: "Campaigns" },
  { key: "maxFlows", label: "Chatbot flows" },
];

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
    maxAgents: 3,
    maxCampaigns: 5,
    maxFlows: 3,
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
    maxAgents: 10,
    maxCampaigns: 50,
    maxFlows: 15,
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
    maxAgents: 100,
    maxCampaigns: 500,
    maxFlows: 100,
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
const limitLabel = (v: number) => (v >= 1_000_000 ? "Unlimited" : formatCompact(v));

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPlansPage() {
  const { data, isLoading } = usePlans();
  const [editing, setEditing] = useState<Plan | null>(null);

  const plans = data && data.length > 0 ? data : FALLBACK_PLANS;

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
            const popular = plan.name.toUpperCase() === "GROWTH";
            return (
              <AdminCard
                key={plan.id}
                className={cn(
                  "relative flex flex-col p-6",
                  popular && "ring-2 ring-violet-500",
                )}
              >
                {popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-violet-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white shadow-lg shadow-violet-950/50">
                    Most Popular
                  </span>
                )}

                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-100">{plan.displayName}</h3>
                    <p className="mt-1 text-xs text-slate-500">{plan.description ?? "—"}</p>
                  </div>
                  <AdminBadge tone={plan.isActive ? "emerald" : "slate"}>
                    {plan.isActive ? "Active" : "Hidden"}
                  </AdminBadge>
                </div>

                <p className="mt-5 flex items-baseline gap-1">
                  <span className="text-3xl font-bold tracking-tight text-slate-100">
                    {formatCurrency(plan.priceMonthly)}
                  </span>
                  <span className="text-sm text-slate-500">/mo</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatCurrency(plan.priceAnnual)} billed annually
                </p>

                <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                  <Users className="h-4 w-4 text-violet-400" />
                  <span className="text-sm text-slate-200">
                    {subscribersOf(plan).toLocaleString("en-IN")}
                  </span>
                  <span className="text-xs text-slate-500">subscribers</span>
                </div>

                <ul className="mt-5 space-y-2 border-t border-slate-800 pt-5 text-sm">
                  {LIMITS.map((l) => (
                    <li key={String(l.key)} className="flex items-center justify-between gap-2">
                      <span className="text-slate-400">{l.label}</span>
                      <span className="font-medium text-slate-200">
                        {limitLabel(Number(plan[l.key] ?? 0))}
                      </span>
                    </li>
                  ))}
                </ul>

                <ul className="mt-5 space-y-2 border-t border-slate-800 pt-5 text-sm">
                  {FEATURES.map((f) => {
                    const on = Boolean(plan[f.key]);
                    return (
                      <li key={String(f.key)} className="flex items-center gap-2">
                        {on ? (
                          <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                        ) : (
                          <X className="h-4 w-4 shrink-0 text-slate-600" />
                        )}
                        <span className={on ? "text-slate-200" : "text-slate-600 line-through"}>
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
      <AdminPanel
        title="Plan comparison"
        subtitle="All plans × limits × features"
        className="mt-6"
        bodyClassName="p-0"
        action={<Sparkles className="h-4 w-4 text-violet-400" />}
      >
        <AdminTable>
          <thead className="border-b border-slate-800 bg-slate-950/40">
            <tr>
              <th className={thClass}>Capability</th>
              {plans.map((p) => (
                <th key={p.id} className={cn(thClass, "text-center")}>
                  <AdminBadge tone={planTone(p.name)}>{p.displayName}</AdminBadge>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            <tr>
              <td className={cn(tdClass, "font-medium text-slate-200")}>Price / month</td>
              {plans.map((p) => (
                <td key={p.id} className={cn(tdClass, "text-center text-slate-100")}>
                  {formatCurrency(p.priceMonthly)}
                </td>
              ))}
            </tr>
            {LIMITS.map((l) => (
              <tr key={String(l.key)}>
                <td className={cn(tdClass, "font-medium text-slate-200")}>{l.label}</td>
                {plans.map((p) => (
                  <td key={p.id} className={cn(tdClass, "text-center")}>
                    {limitLabel(Number(p[l.key] ?? 0))}
                  </td>
                ))}
              </tr>
            ))}
            {FEATURES.map((f) => (
              <tr key={String(f.key)}>
                <td className={cn(tdClass, "font-medium text-slate-200")}>{f.label}</td>
                {plans.map((p) => (
                  <td key={p.id} className={tdClass}>
                    <div className="flex justify-center">
                      {p[f.key] ? (
                        <Check className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Minus className="h-4 w-4 text-slate-600" />
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className={cn(tdClass, "font-medium text-slate-200")}>Subscribers</td>
              {plans.map((p) => (
                <td key={p.id} className={cn(tdClass, "text-center text-slate-100")}>
                  {subscribersOf(p).toLocaleString("en-IN")}
                </td>
              ))}
            </tr>
          </tbody>
        </AdminTable>
      </AdminPanel>

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
  maxAgents: number;
  maxCampaigns: number;
  maxFlows: number;
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
      maxAgents: plan.maxAgents,
      maxCampaigns: plan.maxCampaigns,
      maxFlows: plan.maxFlows,
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

  const numberFields: { key: keyof PlanForm; label: string }[] = [
    { key: "priceMonthly", label: "Monthly price (₹)" },
    { key: "priceAnnual", label: "Annual price (₹)" },
    { key: "maxContacts", label: "Max contacts" },
    { key: "maxMsgPerMonth", label: "Max messages / month" },
    { key: "maxAgents", label: "Max agents" },
    { key: "maxCampaigns", label: "Max campaigns" },
    { key: "maxFlows", label: "Max chatbot flows" },
  ];

  const toggles: { key: keyof PlanForm; label: string }[] = [
    { key: "aiEnabled", label: "AI auto-reply" },
    { key: "ragEnabled", label: "Knowledge base (RAG)" },
    { key: "advancedAi", label: "Advanced AI" },
    { key: "whiteLabel", label: "White label" },
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
            </Field>
          ))}
        </div>

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
                  form[t.key] ? "bg-violet-600" : "bg-slate-300",
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
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-50"
          >
            {update.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
