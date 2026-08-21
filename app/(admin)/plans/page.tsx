"use client";

/**
 * Plan management (SUPER_ADMIN).
 *
 * Two catalogues behind one set of tabs, because they are read for different
 * reasons. The public tiers are a pricing page — compared side by side as cards,
 * which is how a customer will see them. The custom tiers are a list of deals:
 * what was agreed, with whom, and whether anyone is still on it. A grid of cards
 * would be the wrong shape for the second the moment there are more than three.
 *
 * Data: GET/POST /api/admin/plans · PATCH/DELETE /api/admin/plans/[id].
 * If the DB has no plans seeded yet the cards fall back to the catalogue defaults.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Check,
  Copy,
  Pencil,
  Plus,
  Rocket,
  Sparkles,
  Trash2,
  Users,
  X,
  Zap,
} from "lucide-react";
import { Modal } from "@/components/ui";
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
  AdminSkeleton,
  AdminTable,
  Segmented,
  tdClass,
  thClass,
} from "@/components/admin/ui";
import { PlanFormModal, type AdminPlan, type PlanFormMode } from "@/components/admin/PlanFormModal";
import { cn, formatCompact, formatCurrency } from "@/lib/utils";

// ─── Vocabulary ───────────────────────────────────────────────────────────────

const FEATURES: { key: keyof AdminPlan; label: string }[] = [
  { key: "aiEnabled", label: "AI auto-reply" },
  { key: "ragEnabled", label: "Knowledge base (RAG)" },
  { key: "advancedAi", label: "Advanced AI (lead scoring)" },
  { key: "whiteLabel", label: "White label" },
  { key: "allowExport", label: "CSV export" },
];

const LIMITS: { key: keyof AdminPlan; label: string }[] = [
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

/** The handful of caps worth showing inline in the custom-plan table. */
const CUSTOM_TABLE_LIMITS: { key: keyof AdminPlan; label: string }[] = [
  { key: "maxContacts", label: "Contacts" },
  { key: "maxMsgPerMonth", label: "Msg / mo" },
  { key: "maxAgents", label: "Agents" },
  { key: "maxBusinesses", label: "Businesses" },
];

/** Tier icon, keyed off the plan name — gives each card visual hierarchy. */
const TIER_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  STARTER: Zap,
  GROWTH: Rocket,
  ENTERPRISE: Building2,
};

/** TODO [SHALMON]: only used when the plans table is empty (pre-seed). */
const FALLBACK_BASE = {
  maxStorageMb: 1024,
  aiCredits: 0,
  sortOrder: 0,
  stripePriceId: null,
  visibility: "PUBLIC" as const,
  ownerTenantId: null,
  isPopular: false,
  isActive: true,
  allowedAiModels: [] as string[],
  subscribers: 0,
};

const FALLBACK_PLANS: AdminPlan[] = [
  {
    ...FALLBACK_BASE,
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
    allowExport: false,
    aiEnabled: false,
    ragEnabled: false,
    whiteLabel: false,
    advancedAi: false,
    sortOrder: 1,
  },
  {
    ...FALLBACK_BASE,
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
    allowExport: true,
    aiEnabled: true,
    ragEnabled: true,
    whiteLabel: false,
    advancedAi: false,
    sortOrder: 2,
  },
  {
    ...FALLBACK_BASE,
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
    allowExport: true,
    aiEnabled: true,
    ragEnabled: true,
    whiteLabel: true,
    advancedAi: true,
    sortOrder: 3,
  },
];

// ─── Data ─────────────────────────────────────────────────────────────────────

function usePlans() {
  return useQuery<AdminPlan[]>({
    queryKey: ["admin", "plans"],
    queryFn: async () => {
      const res = await fetch("/api/admin/plans");
      if (!res.ok) throw new Error(`Failed to load plans (${res.status})`);
      const json = await res.json();
      const rows = json.data ?? json;
      return (Array.isArray(rows) ? rows : []) as AdminPlan[];
    },
    retry: false,
  });
}

function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/plans/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Delete failed (${res.status})`);
      return json;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "plans"] }),
  });
}

const subscribersOf = (p: AdminPlan) => p.subscribers ?? p._count?.subscriptions ?? 0;

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
 *
 * Only ever asked of the public plans. A custom tier has one subscriber by
 * construction and no card for a ribbon to sit on.
 */
function popularPlanId(plans: AdminPlan[]): string | null {
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

type Tab = "public" | "custom";

export default function AdminPlansPage() {
  const { data, isLoading } = usePlans();
  const [tab, setTab] = useState<Tab>("public");
  const [form, setForm] = useState<PlanFormMode | null>(null);
  const [deleting, setDeleting] = useState<AdminPlan | null>(null);

  const rows = useMemo(() => data ?? [], [data]);
  const custom = useMemo(() => rows.filter((p) => p.visibility === "PRIVATE"), [rows]);
  const publicPlans = useMemo(() => {
    const live = rows.filter((p) => p.visibility !== "PRIVATE");
    return live.length > 0 ? live : FALLBACK_PLANS;
  }, [rows]);

  // Resolved once across the whole set, not per card — "most" is a question
  // about every plan at once, and asking it inside the map would let two cards
  // each conclude they were the answer.
  const popularId = popularPlanId(publicPlans);

  return (
    <>
      <AdminPageHeader
        title="Plans"
        description="Pricing, limits and feature gates for every subscription tier."
        action={
          <div className="flex items-center gap-3">
            <Segmented<Tab>
              value={tab}
              onChange={setTab}
              options={[
                { value: "public", label: `Public (${publicPlans.length})` },
                { value: "custom", label: `Custom (${custom.length})` },
              ]}
            />
            <AdminButton onClick={() => setForm({ kind: "create" })}>
              <Plus className="h-4 w-4" />
              New plan
            </AdminButton>
          </div>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <AdminSkeleton key={i} className="h-96 w-full rounded-xl" />
          ))}
        </div>
      ) : tab === "public" ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {publicPlans.map((plan) => (
            <PublicPlanCard
              key={plan.id}
              plan={plan}
              popular={plan.id === popularId}
              onEdit={() => setForm({ kind: "edit", plan })}
              onClone={() => setForm({ kind: "create", cloneFrom: plan })}
            />
          ))}
        </div>
      ) : (
        <CustomPlansTable
          plans={custom}
          onNew={() => setForm({ kind: "create" })}
          onEdit={(plan) => setForm({ kind: "edit", plan })}
          onClone={(plan) => setForm({ kind: "create", cloneFrom: plan })}
          onDelete={setDeleting}
        />
      )}

      <PlanFormModal mode={form} onClose={() => setForm(null)} />
      <DeletePlanModal plan={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}

// ─── Public tier card ─────────────────────────────────────────────────────────

function PublicPlanCard({
  plan,
  popular,
  onEdit,
  onClone,
}: {
  plan: AdminPlan;
  popular: boolean;
  onEdit: () => void;
  onClone: () => void;
}) {
  const TierIcon = TIER_ICON[plan.name.toUpperCase()] ?? Sparkles;

  return (
    <AdminCard className={cn("relative flex flex-col p-6", popular && "border-2 border-violet-600")}>
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
        <span className="text-sm text-slate-900">{subscribersOf(plan).toLocaleString("en-IN")}</span>
        <span className="text-xs text-slate-500">subscribers</span>
      </div>

      <ul className="mt-5 space-y-2 border-t border-slate-200 pt-5 text-sm">
        {LIMITS.map((l) => (
          <li key={String(l.key)} className="flex items-center justify-between gap-2">
            <span className="text-slate-500">{l.label}</span>
            <span className="font-medium text-slate-900">{limitLabel(Number(plan[l.key] ?? 0))}</span>
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
              <span className={on ? "text-slate-900" : "text-slate-400 line-through"}>{f.label}</span>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 flex gap-2">
        <AdminButton variant={popular ? "primary" : "secondary"} className="flex-1" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
          Edit
        </AdminButton>
        {/* The quickest route to a custom deal: start from the tier it was
            negotiated down from, rather than from twenty empty fields. */}
        <AdminButton variant="secondary" onClick={onClone} title="Create a custom plan from this one">
          <Copy className="h-4 w-4" />
          Clone
        </AdminButton>
      </div>
    </AdminCard>
  );
}

// ─── Custom tier table ────────────────────────────────────────────────────────

function CustomPlansTable({
  plans,
  onNew,
  onEdit,
  onClone,
  onDelete,
}: {
  plans: AdminPlan[];
  onNew: () => void;
  onEdit: (plan: AdminPlan) => void;
  onClone: (plan: AdminPlan) => void;
  onDelete: (plan: AdminPlan) => void;
}) {
  if (plans.length === 0) {
    return (
      <AdminPanel
        title="Custom plans"
        subtitle="Negotiated tiers, hidden from the pricing page"
        bodyClassName="p-0"
      >
        <AdminEmptyState
          icon={Sparkles}
          title="No custom plans yet"
          description="A custom plan is a tier only you can assign — for a workspace whose deal does not fit the public pricing. Start one from scratch, or clone the public tier it was negotiated down from."
          action={
            <AdminButton onClick={onNew}>
              <Plus className="h-4 w-4" />
              New custom plan
            </AdminButton>
          }
        />
      </AdminPanel>
    );
  }

  return (
    <AdminPanel
      title="Custom plans"
      subtitle={`${plans.length} negotiated tier${plans.length === 1 ? "" : "s"}, hidden from the pricing page`}
      bodyClassName="p-0"
    >
      <AdminTable>
        <thead className="border-b border-slate-200 bg-[#FAFAFA]">
          <tr>
            <th className={thClass}>Plan</th>
            <th className={thClass}>Belongs to</th>
            <th className={cn(thClass, "text-right")}>Price / mo</th>
            {CUSTOM_TABLE_LIMITS.map((l) => (
              <th key={String(l.key)} className={cn(thClass, "text-right")}>
                {l.label}
              </th>
            ))}
            <th className={cn(thClass, "text-right")}>On it</th>
            <th className={thClass}>Status</th>
            <th className={cn(thClass, "text-right")}>Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {plans.map((plan) => {
            const on = subscribersOf(plan);
            return (
              <tr key={plan.id} className="hover:bg-slate-50/60">
                <td className={tdClass}>
                  <p className="font-medium text-slate-900">{plan.displayName}</p>
                  <p className="font-mono text-[11px] text-slate-400">{plan.name}</p>
                </td>
                <td className={tdClass}>
                  {plan.ownerTenant ? (
                    <AdminBadge tone="sky">{plan.ownerTenant.name}</AdminBadge>
                  ) : (
                    /* Not an error state. An unowned private tier is the reusable
                       one — the same deal offered to several workspaces. */
                    <span className="text-xs text-slate-400">Reusable — no single owner</span>
                  )}
                </td>
                <td className={cn(tdClass, "text-right font-medium text-slate-900")}>
                  {formatCurrency(plan.priceMonthly)}
                </td>
                {CUSTOM_TABLE_LIMITS.map((l) => (
                  <td key={String(l.key)} className={cn(tdClass, "text-right")}>
                    {limitLabel(Number(plan[l.key] ?? 0))}
                  </td>
                ))}
                <td className={cn(tdClass, "text-right")}>{on.toLocaleString("en-IN")}</td>
                <td className={tdClass}>
                  <AdminBadge tone={plan.isActive ? "emerald" : "slate"}>
                    {plan.isActive ? "Active" : "Retired"}
                  </AdminBadge>
                </td>
                <td className={cn(tdClass, "text-right")}>
                  <div className="flex justify-end gap-1">
                    <AdminButton variant="ghost" size="sm" onClick={() => onEdit(plan)} title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </AdminButton>
                    <AdminButton variant="ghost" size="sm" onClick={() => onClone(plan)} title="Clone">
                      <Copy className="h-3.5 w-3.5" />
                    </AdminButton>
                    {/* Deleting a plan someone is on would strand their
                        subscription, so the route refuses it. Disabled here as
                        well, rather than left to fail, so the reason is visible
                        before the click. */}
                    <AdminButton
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(plan)}
                      disabled={on > 0}
                      title={on > 0 ? `${on} workspace(s) are on this plan` : "Delete"}
                      className={on > 0 ? undefined : "text-rose-600 hover:bg-rose-50 hover:text-rose-700"}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </AdminButton>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </AdminTable>
    </AdminPanel>
  );
}

// ─── Delete confirmation ──────────────────────────────────────────────────────

function DeletePlanModal({ plan, onClose }: { plan: AdminPlan | null; onClose: () => void }) {
  const remove = useDeletePlan();

  if (!plan) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Delete ${plan.displayName}?`}
      description="This removes the tier itself. It cannot be undone."
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Nobody is subscribed to this plan, so nothing is billed or downgraded by removing it. Any
          past subscription that referenced it keeps its own record.
        </p>

        {remove.isError && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {(remove.error as Error).message}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <AdminButton
            variant="danger"
            disabled={remove.isPending}
            onClick={() => remove.mutate(plan.id, { onSuccess: onClose })}
          >
            {remove.isPending ? "Deleting…" : "Delete plan"}
          </AdminButton>
        </div>
      </div>
    </Modal>
  );
}
