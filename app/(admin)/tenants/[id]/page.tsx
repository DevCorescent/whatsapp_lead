"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  MessageSquare,
  Pause,
  Play,
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
  planTone,
} from "@/components/admin/ui";
import { Avatar } from "@/components/ui";
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
    plan: {
      id: string;
      name: string;
      displayName: string;
      priceMonthly: number;
      maxContacts: number;
      maxMsgPerMonth: number;
      maxAgents: number;
    };
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

interface Plan {
  id: string;
  name: string;
  displayName: string;
  priceMonthly: number;
}

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
  return useQuery<Plan[]>({
    queryKey: ["admin", "plans"],
    queryFn: async () => {
      const res = await fetch("/api/admin/plans");
      if (!res.ok) return [];
      const json = await res.json();
      return (json.data ?? []) as Plan[];
    },
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: tenant, isLoading, isError } = useTenant(id);
  const { data: plans = [] } = usePlans();
  const update = useUpdateTenant(id);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [planError, setPlanError] = useState("");

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
        <Building2 className="h-12 w-12 text-slate-700" />
        <p className="text-slate-400">Tenant not found or failed to load.</p>
        <AdminButton variant="secondary" onClick={() => router.push("/tenants")}>
          <ArrowLeft className="h-4 w-4" /> Back to tenants
        </AdminButton>
      </div>
    );
  }

  const sub = tenant.subscription;
  const plan = sub?.plan;

  const changePlan = () => {
    if (!selectedPlan) { setPlanError("Select a plan first"); return; }
    setPlanError("");
    update.mutate({ planId: selectedPlan }, {
      onSuccess: () => setSelectedPlan(""),
    });
  };

  return (
    <>
      {/* Back + header */}
      <button
        onClick={() => router.push("/tenants")}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-slate-100"
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
        <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
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

      {/* Subscription + plan change */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AdminPanel title="Subscription" subtitle="Current billing plan and period">
          {sub ? (
            <dl className="space-y-3 text-sm">
              <Row label="Plan">
                <AdminBadge tone={planTone(plan?.displayName)}>
                  {plan?.displayName ?? "—"}
                </AdminBadge>
              </Row>
              <Row label="Status">
                <AdminBadge tone={sub.status === "ACTIVE" ? "emerald" : sub.status === "TRIALING" ? "sky" : "rose"}>
                  {sub.status}
                </AdminBadge>
              </Row>
              <Row label="Billing cycle">{sub.billingCycle}</Row>
              <Row label="Price">₹{plan?.priceMonthly?.toLocaleString("en-IN") ?? "—"}/mo</Row>
              <Row label="Period start">{formatDate(sub.currentPeriodStart)}</Row>
              <Row label="Period end">{formatDate(sub.currentPeriodEnd)}</Row>
              {sub.trialEndsAt && <Row label="Trial ends">{formatDate(sub.trialEndsAt)}</Row>}
              {sub.cancelledAt && <Row label="Cancelled">{formatDate(sub.cancelledAt)}</Row>}
            </dl>
          ) : (
            <p className="text-sm text-slate-500">No subscription record found.</p>
          )}
        </AdminPanel>

        <AdminPanel title="Change Plan" subtitle="Switch this workspace to a different tier">
          <div className="space-y-3">
            <select
              value={selectedPlan}
              onChange={(e) => { setSelectedPlan(e.target.value); setPlanError(""); }}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="">Select new plan…</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName} — ₹{p.priceMonthly.toLocaleString("en-IN")}/mo
                </option>
              ))}
            </select>
            {planError && <p className="text-xs text-rose-400">{planError}</p>}
            <AdminButton
              onClick={changePlan}
              disabled={update.isPending || !selectedPlan}
              className="w-full justify-center"
            >
              {update.isPending ? "Saving…" : "Apply Plan Change"}
            </AdminButton>
          </div>
        </AdminPanel>
      </div>

      {/* WhatsApp config */}
      <div className="mt-6">
        <AdminPanel title="WhatsApp Configuration" subtitle="Credentials saved in workspace settings">
          {tenant.settings ? (
            <dl className="space-y-3 text-sm">
              <Row label="Phone Number ID">
                <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-300">
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
    violet: "text-violet-400 bg-violet-500/10",
    emerald: "text-emerald-400 bg-emerald-500/10",
    sky: "text-sky-400 bg-sky-500/10",
    amber: "text-amber-400 bg-amber-500/10",
  };
  return (
    <AdminCard className="p-4">
      <div className={cn("mb-2 inline-flex rounded-lg p-2", colors[tone])}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-bold text-slate-100">{value.toLocaleString()}</p>
      <p className="mt-0.5 text-xs text-slate-500">{label}</p>
    </AdminCard>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right text-slate-200">{children}</dd>
    </div>
  );
}
