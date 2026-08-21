"use client";

import { use, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  MessageSquare,
  Pause,
  Play,
  Sparkles,
  Users,
  UserCheck,
  TrendingUp,
} from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminPageHeader,
  AdminPanel,
  AdminSkeleton,
  adminInputClass,
  planTone,
} from "@/components/admin/ui";
import { PlanFormModal, type AdminPlan, type PlanFormMode } from "@/components/admin/PlanFormModal";
import { planOverages, type UsedCounts } from "@/lib/billing/overage";
import { cn, formatDate } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  subscription: {
    id: string;
    status: string;
    billingCycle: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    trialEndsAt: string | null;
    cancelledAt: string | null;
    /** Present while Stripe is still billing this workspace for something. */
    stripeSubId?: string | null;
    /** Set when an admin pinned this plan by hand; Stripe no longer writes to the row. */
    planLockedAt?: string | null;
    plan: AdminPlan;
  } | null;
  settings: {
    waPhoneNumberId: string | null;
    waApiKey: string | null;
    timezone: string | null;
  } | null;
  _count: {
    users: number;
    contacts: number;
    leads: number;
    conversations: number;
  };
}

interface SubscriptionAdmin {
  subscription: TenantDetail["subscription"];
  used: UsedCounts;
}

const STATUSES = ["ACTIVE", "TRIALING", "PAST_DUE", "CANCELLED", "EXPIRED"] as const;
const CYCLES = ["MONTHLY", "ANNUAL"] as const;

type AssignForm = {
  planId: string;
  status: (typeof STATUSES)[number];
  billingCycle: (typeof CYCLES)[number];
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEndsAt: string;
  resetUsage: boolean;
};

/** Date → the yyyy-mm-dd a date input expects, or "" when there is no date. */
const toDateInput = (value: string | null | undefined) =>
  value ? new Date(value).toISOString().slice(0, 10) : "";

// ─── Data hooks ───────────────────────────────────────────────────────────────

function useTenant(id: string) {
  return useQuery<TenantDetail>({
    queryKey: ["admin", "tenant", id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/tenants/${id}`);
      if (!res.ok) throw new Error(`Failed to load tenant (${res.status})`);
      const json = await res.json();
      return json.data as TenantDetail;
    },
    retry: false,
  });
}

function usePlans() {
  return useQuery<AdminPlan[]>({
    queryKey: ["admin", "plans"],
    queryFn: async () => {
      const res = await fetch("/api/admin/plans");
      if (!res.ok) return [];
      const json = await res.json();
      return (json.data ?? []) as AdminPlan[];
    },
  });
}

/**
 * The tenant's live counts, for the downgrade warning.
 *
 * Separate from the tenant query because it is metered rather than stored —
 * counting contacts, messages and storage is a dozen aggregate queries, and the
 * tenant header should not wait on them to render a name.
 */
function useSubscriptionAdmin(id: string) {
  return useQuery<SubscriptionAdmin>({
    queryKey: ["admin", "tenant", id, "subscription"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/tenants/${id}/subscription`);
      if (!res.ok) throw new Error(`Failed to load subscription (${res.status})`);
      const json = await res.json();
      return json.data as SubscriptionAdmin;
    },
    retry: false,
  });
}

function useUpdateTenant(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/admin/tenants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Update failed (${res.status})`);
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "tenant", id] });
      qc.invalidateQueries({ queryKey: ["admin", "tenants"] });
    },
  });
}

function useAssignSubscription(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/admin/tenants/${id}/subscription`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Assign failed (${res.status})`);
      return json.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "tenant", id] });
      qc.invalidateQueries({ queryKey: ["admin", "tenants"] });
      qc.invalidateQueries({ queryKey: ["admin", "plans"] });
    },
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: tenant, isLoading, isError } = useTenant(id);
  const update = useUpdateTenant(id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <AdminSkeleton className="h-10 w-48" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => <AdminSkeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <AdminSkeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (isError || !tenant) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <Building2 className="h-12 w-12 text-slate-300" />
        <p className="text-slate-500">Tenant not found or failed to load.</p>
        <AdminButton variant="secondary" onClick={() => router.push("/tenants")}>
          <ArrowLeft className="h-4 w-4" /> Back to tenants
        </AdminButton>
      </div>
    );
  }

  const sub = tenant.subscription;
  const plan = sub?.plan;

  return (
    <>
      {/* Back + header */}
      <button
        onClick={() => router.push("/tenants")}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> All tenants
      </button>

      <AdminPageHeader
        title={tenant.name}
        description={`/${tenant.slug} · joined ${formatDate(tenant.createdAt)}`}
        action={
          <div className="flex items-center gap-2">
            <AdminBadge tone={tenant.isActive ? "emerald" : "rose"}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {tenant.isActive ? "Active" : "Suspended"}
            </AdminBadge>
            <AdminButton
              variant={tenant.isActive ? "danger" : "secondary"}
              size="sm"
              disabled={update.isPending}
              onClick={() => update.mutate({ isActive: !tenant.isActive })}
            >
              {tenant.isActive ? (
                <><Pause className="h-3.5 w-3.5" /> Suspend</>
              ) : (
                <><Play className="h-3.5 w-3.5" /> Activate</>
              )}
            </AdminButton>
          </div>
        }
      />

      {update.isError && (
        <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {(update.error as Error).message}
        </p>
      )}

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile icon={Users} label="Users" value={tenant._count.users} tone="violet" />
        <StatTile icon={UserCheck} label="Contacts" value={tenant._count.contacts} tone="sky" />
        <StatTile icon={TrendingUp} label="Leads" value={tenant._count.leads} tone="emerald" />
        <StatTile icon={MessageSquare} label="Conversations" value={tenant._count.conversations} tone="amber" />
      </div>

      {/* Subscription + assignment */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AdminPanel title="Subscription" subtitle="Current billing plan and period">
          {sub ? (
            <dl className="space-y-3 text-sm">
              <Row label="Plan">
                <span className="inline-flex items-center gap-1.5">
                  <AdminBadge tone={planTone(plan?.displayName)}>{plan?.displayName ?? "—"}</AdminBadge>
                  {plan?.visibility === "PRIVATE" && (
                    <AdminBadge tone="violet">
                      <Sparkles className="h-3 w-3" /> Custom
                    </AdminBadge>
                  )}
                </span>
              </Row>
              <Row label="Status">
                <AdminBadge tone={sub.status === "ACTIVE" ? "emerald" : sub.status === "TRIALING" ? "sky" : "rose"}>
                  {sub.status}
                </AdminBadge>
              </Row>
              <Row label="Billing cycle">{sub.billingCycle}</Row>
              <Row label="Price">₹{plan?.priceMonthly?.toLocaleString("en-IN") ?? "—"}/mo</Row>
              <Row label="Billed through">
                {/* A custom tier has no Stripe price, which is the visible sign
                    that nothing about it is charged automatically. */}
                {plan?.stripePriceId ? "Stripe" : "Invoiced offline"}
              </Row>
              <Row label="Period start">{formatDate(sub.currentPeriodStart)}</Row>
              <Row label="Period end">{formatDate(sub.currentPeriodEnd)}</Row>
              {sub.trialEndsAt && <Row label="Trial ends">{formatDate(sub.trialEndsAt)}</Row>}
              {sub.cancelledAt && <Row label="Cancelled">{formatDate(sub.cancelledAt)}</Row>}
            </dl>
          ) : (
            <p className="text-sm text-slate-500">
              No subscription record — this workspace is on the implicit free tier.
            </p>
          )}
        </AdminPanel>

        <AssignPlanPanel tenant={tenant} />
      </div>

      {/* WhatsApp config */}
      <div className="mt-6">
        <AdminPanel title="WhatsApp Configuration" subtitle="Credentials saved in workspace settings">
          {tenant.settings ? (
            <dl className="space-y-3 text-sm">
              <Row label="Phone Number ID">
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                  {tenant.settings.waPhoneNumberId ?? "—"}
                </code>
              </Row>
              <Row label="API Key configured">
                <AdminBadge tone={tenant.settings.waApiKey ? "emerald" : "slate"}>
                  {tenant.settings.waApiKey ? <><CheckCircle2 className="h-3 w-3" /> Yes</> : "Not set"}
                </AdminBadge>
              </Row>
              <Row label="Timezone">{tenant.settings.timezone ?? "UTC"}</Row>
            </dl>
          ) : (
            <p className="text-sm text-slate-500">No settings configured yet.</p>
          )}
        </AdminPanel>
      </div>
    </>
  );
}

// ─── Assign / build a plan ────────────────────────────────────────────────────

function AssignPlanPanel({ tenant }: { tenant: TenantDetail }) {
  const { data: plans = [] } = usePlans();
  const { data: admin } = useSubscriptionAdmin(tenant.id);
  const assign = useAssignSubscription(tenant.id);

  const sub = tenant.subscription;
  const [form, setForm] = useState<AssignForm>(() => ({
    planId: "",
    status: (sub?.status as AssignForm["status"]) ?? "ACTIVE",
    billingCycle: (sub?.billingCycle as AssignForm["billingCycle"]) ?? "MONTHLY",
    currentPeriodStart: toDateInput(sub?.currentPeriodStart),
    currentPeriodEnd: toDateInput(sub?.currentPeriodEnd),
    trialEndsAt: toDateInput(sub?.trialEndsAt),
    resetUsage: false,
  }));
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [planForm, setPlanForm] = useState<PlanFormMode | null>(null);

  /**
   * What this workspace may be put on: the public catalogue, the tier built for
   * it, and any reusable private tier. Another customer's owned plan is excluded
   * — the route refuses it, and offering it in a dropdown only to fail on save
   * would be a worse way to communicate the same rule.
   */
  const options = useMemo(() => {
    const assignable = plans.filter(
      (p) =>
        p.visibility === "PUBLIC" ||
        !p.ownerTenantId ||
        p.ownerTenantId === tenant.id,
    );
    return {
      public: assignable.filter((p) => p.visibility === "PUBLIC"),
      custom: assignable.filter((p) => p.visibility === "PRIVATE"),
    };
  }, [plans, tenant.id]);

  const selected = plans.find((p) => p.id === form.planId) ?? null;

  // Recomputed as the dropdown changes, from the same pure function the route
  // runs after saving — so what the admin is warned about and what gets recorded
  // in the audit log cannot disagree.
  const used = admin?.used;
  const overages = useMemo(
    () => (selected && used ? planOverages(used, selected) : []),
    [selected, used],
  );

  const submit = () => {
    if (!form.planId) {
      setError("Select a plan first");
      return;
    }
    setError("");
    setWarnings([]);
    assign.mutate(
      {
        planId: form.planId,
        status: form.status,
        billingCycle: form.billingCycle,
        ...(form.currentPeriodStart && { currentPeriodStart: form.currentPeriodStart }),
        ...(form.currentPeriodEnd && { currentPeriodEnd: form.currentPeriodEnd }),
        trialEndsAt: form.trialEndsAt || null,
        resetUsage: form.resetUsage,
      },
      {
        onSuccess: (data) => {
          setForm((f) => ({ ...f, planId: "", resetUsage: false }));
          setWarnings(((data as { warnings?: string[] })?.warnings ?? []) as string[]);
        },
      },
    );
  };

  return (
    <AdminPanel
      title="Plan & billing period"
      subtitle="Assign a tier and set the terms it runs on"
    >
      <div className="space-y-3">
        <label className="block text-xs font-medium text-slate-500" htmlFor="ap-plan">
          Plan
        </label>
        <select
          id="ap-plan"
          value={form.planId}
          onChange={(e) => {
            setForm((f) => ({ ...f, planId: e.target.value }));
            setError("");
          }}
          className={adminInputClass}
        >
          <option value="">Select a plan…</option>
          {options.public.length > 0 && (
            <optgroup label="Public tiers">
              {options.public.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName} — ₹{p.priceMonthly.toLocaleString("en-IN")}/mo
                </option>
              ))}
            </optgroup>
          )}
          {options.custom.length > 0 && (
            <optgroup label="Custom tiers">
              {options.custom.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName} — ₹{p.priceMonthly.toLocaleString("en-IN")}/mo
                  {p.ownerTenantId ? "" : " (reusable)"}
                </option>
              ))}
            </optgroup>
          )}
        </select>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500" htmlFor="ap-status">
              Status
            </label>
            <select
              id="ap-status"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as AssignForm["status"] }))}
              className={adminInputClass}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500" htmlFor="ap-cycle">
              Billing cycle
            </label>
            <select
              id="ap-cycle"
              value={form.billingCycle}
              onChange={(e) => setForm((f) => ({ ...f, billingCycle: e.target.value as AssignForm["billingCycle"] }))}
              className={adminInputClass}
            >
              {CYCLES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500" htmlFor="ap-start">
              Period starts
            </label>
            <input
              id="ap-start"
              type="date"
              value={form.currentPeriodStart}
              onChange={(e) => setForm((f) => ({ ...f, currentPeriodStart: e.target.value }))}
              className={adminInputClass}
            />
            <p className="mt-1 text-[11px] text-slate-500">
              {/* Campaigns and messages are metered from this date, so moving it
                  hands the workspace a fresh allowance of both. */}
              Usage is counted from here. Leave it to keep the current window.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500" htmlFor="ap-end">
              Period ends
            </label>
            <input
              id="ap-end"
              type="date"
              value={form.currentPeriodEnd}
              onChange={(e) => setForm((f) => ({ ...f, currentPeriodEnd: e.target.value }))}
              className={adminInputClass}
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Empty follows the cycle from today.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500" htmlFor="ap-trial">
              Trial ends
            </label>
            <input
              id="ap-trial"
              type="date"
              value={form.trialEndsAt}
              onChange={(e) => setForm((f) => ({ ...f, trialEndsAt: e.target.value }))}
              className={adminInputClass}
            />
            <p className="mt-1 text-[11px] text-slate-500">Only meaningful while TRIALING.</p>
          </div>
        </div>

        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3">
          <input
            type="checkbox"
            checked={form.resetUsage}
            onChange={(e) => setForm((f) => ({ ...f, resetUsage: e.target.checked }))}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-[#0B6E4F] focus:ring-emerald-200"
          />
          <span>
            <span className="text-sm font-medium text-slate-800">Reset AI credits to zero</span>
            <span className="mt-0.5 block text-[11px] text-slate-500">
              A new deal usually means a fresh allowance. Leave it off when you are only correcting
              a date — otherwise they get a second month of credits for free.
            </span>
          </span>
        </label>

        {/* Stripe does not know about an offline custom tier, so a subscription
            left running there keeps charging for the plan they are no longer on.
            Said before the click, not only in the result. */}
        {sub?.stripeSubId && selected && !selected.stripePriceId && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-rose-900">
              <AlertTriangle className="h-3.5 w-3.5" />
              Live Stripe subscription
            </p>
            <p className="mt-1 text-[11px] text-rose-800">
              This workspace is still billed by Stripe on{" "}
              <code className="rounded bg-white/60 px-1">{sub.stripeSubId}</code>. Assigning an
              offline-invoiced plan does not cancel it — do that in Stripe, or they pay for both.
            </p>
          </div>
        )}

        {sub?.planLockedAt && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
            This plan was set by hand, so Stripe events no longer overwrite it. Assigning a plan
            that has a Stripe price hands control back.
          </p>
        )}

        {warnings.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-900">Applied, with caveats</p>
            <ul className="mt-1 space-y-1 text-[11px] text-amber-800">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* The warning that makes a downgrade honest. Nothing is deleted by
            moving a workspace onto a smaller tier — enforcement only refuses the
            NEXT create — so without this the tenant would simply find itself
            unable to add a contact, with no explanation anywhere. */}
        {overages.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
              <AlertTriangle className="h-3.5 w-3.5" />
              Already over this plan on {overages.length} limit{overages.length === 1 ? "" : "s"}
            </p>
            <ul className="mt-2 space-y-1 text-[11px] text-amber-800">
              {overages.map((o) => (
                <li key={o.label}>
                  {o.used.toLocaleString("en-IN")} {o.label} · limit {o.limit.toLocaleString("en-IN")}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-amber-700">
              Nothing is deleted. They keep what they have and cannot add more until they are back
              under. Assign it anyway if that is the intent.
            </p>
          </div>
        )}

        {(error || assign.isError) && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error || (assign.error as Error)?.message}
          </p>
        )}

        <AdminButton
          onClick={submit}
          disabled={assign.isPending || !form.planId}
          className="w-full justify-center"
        >
          {assign.isPending ? "Saving…" : "Apply plan"}
        </AdminButton>

        <div className="border-t border-slate-200 pt-3">
          <AdminButton
            variant="secondary"
            className="w-full justify-center"
            onClick={() =>
              setPlanForm({
                kind: "create",
                // Prefilled from what they are on now: a custom deal is almost
                // always a public tier with three numbers moved, and starting
                // from the current plan makes those three the only edits.
                cloneFrom: sub?.plan,
                lockedTenant: { id: tenant.id, name: tenant.name },
              })
            }
          >
            <Sparkles className="h-4 w-4" />
            Build a custom plan for this workspace
          </AdminButton>
          <p className="mt-2 text-[11px] text-slate-500">
            Creates a tier only this workspace can be put on, starting from
            {sub?.plan ? ` ${sub.plan.displayName}` : " an empty form"}. It will not appear on the
            pricing page.
          </p>
        </div>
      </div>

      <PlanFormModal
        mode={planForm}
        onClose={() => setPlanForm(null)}
        // Selected but not assigned. Building the plan and putting the customer
        // on it are two decisions, and the second one is the one with a billing
        // period and a status attached to it.
        onSaved={(plan) => setForm((f) => ({ ...f, planId: plan.id }))}
      />
    </AdminPanel>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: "violet" | "emerald" | "sky" | "amber";
}) {
  const colors: Record<string, string> = {
    violet: "text-violet-700 bg-violet-50",
    emerald: "text-emerald-700 bg-emerald-50",
    sky: "text-sky-700 bg-sky-50",
    amber: "text-amber-700 bg-amber-50",
  };
  return (
    <AdminCard className="p-4">
      <div className={cn("mb-2 inline-flex rounded-lg p-2", colors[tone])}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-bold text-slate-900">{value.toLocaleString()}</p>
      <p className="mt-0.5 text-xs text-slate-500">{label}</p>
    </AdminCard>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right text-slate-800">{children}</dd>
    </div>
  );
}
