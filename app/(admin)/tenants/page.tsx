"use client";

/**
 * Tenant management (SUPER_ADMIN).
 * Data: GET /api/admin/tenants · POST /api/admin/tenants · PATCH /api/admin/tenants/[id]
 * TODO [SHALMON]: all three return 501 today — the table renders an empty state and the
 * provision / suspend mutations surface the API error inline instead of crashing.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Eye,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCcw,
  Search,
} from "lucide-react";
import { Avatar, Field, Modal, inputClass } from "@/components/ui";
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  AdminSkeletonRows,
  AdminTable,
  UsageBar,
  adminInputClass,
  adminSelectClass,
  planTone,
  tdClass,
  thClass,
} from "@/components/admin/ui";
import { cn, formatCompact, formatDate } from "@/lib/utils";

// ─── Types + data ─────────────────────────────────────────────────────────────

interface AdminTenant {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  plan?: string | null;
  users?: number;
  messagesThisMonth?: number;
  messageLimit?: number;
  isActive: boolean;
  createdAt: string;
}

interface TenantFilters {
  search: string;
  plan: string;
  status: string;
}

/** Fallback caps so the usage bar still means something before the API sends limits. */
const PLAN_MSG_LIMIT: Record<string, number> = {
  STARTER: 5_000,
  GROWTH: 50_000,
  ENTERPRISE: 500_000,
};

function useAdminTenants(filters: TenantFilters) {
  return useQuery<AdminTenant[]>({
    queryKey: ["admin", "tenants", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.plan) params.set("planId", filters.plan);
      if (filters.status) params.set("isActive", filters.status === "active" ? "true" : "false");
      const res = await fetch(`/api/admin/tenants?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to load tenants (${res.status})`);
      const json = await res.json();
      const rows = json.data ?? json;
      return (Array.isArray(rows) ? rows : []) as AdminTenant[];
    },
    retry: false,
  });
}

function useProvisionTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Provisioning failed (${res.status})`);
      return json;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "tenants"] }),
  });
}

function useUpdateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Record<string, unknown>) => {
      const res = await fetch(`/api/admin/tenants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Update failed (${res.status})`);
      return json;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "tenants"] }),
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminTenantsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [plan, setPlan] = useState("");
  const [status, setStatus] = useState("");
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useAdminTenants({
    search,
    plan,
    status,
  });
  const updateTenant = useUpdateTenant();
  const tenants = data ?? [];

  return (
    <>
      <AdminPageHeader
        title="Tenants"
        description="Every workspace account on the platform."
        action={
          <div className="flex items-center gap-2">
            <AdminButton variant="secondary" onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCcw className={cn("h-4 w-4", isFetching && "animate-spin")} />
              <span className="hidden sm:inline">Refresh</span>
            </AdminButton>
            <AdminButton onClick={() => setProvisionOpen(true)}>
              <Plus className="h-4 w-4" />
              Provision Tenant
            </AdminButton>
          </div>
        }
      />

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by workspace name or slug…"
            aria-label="Search tenants"
            className={cn(adminInputClass, "pl-9")}
          />
        </div>
        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          aria-label="Filter by plan"
          className={cn(adminSelectClass, "sm:w-44")}
        >
          <option value="">All plans</option>
          <option value="starter">Starter</option>
          <option value="growth">Growth</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by status"
          className={cn(adminSelectClass, "sm:w-44")}
        >
          <option value="">All status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {updateTenant.isError && (
        <p className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {(updateTenant.error as Error).message}
        </p>
      )}

      {/* Table */}
      <AdminCard className="overflow-visible">
        {isLoading ? (
          <div className="p-5">
            <AdminSkeletonRows rows={6} />
          </div>
        ) : isError || tenants.length === 0 ? (
          <AdminEmptyState
            icon={Building2}
            title={isError ? "Tenants unavailable" : "No tenants found"}
            description={
              isError
                ? `${(error as Error).message}. GET /api/admin/tenants is not implemented yet.`
                : "No workspace matches these filters. Provision one to get started."
            }
            action={
              <AdminButton onClick={() => setProvisionOpen(true)}>
                <Plus className="h-4 w-4" />
                Provision Tenant
              </AdminButton>
            }
          />
        ) : (
          <AdminTable>
            <thead className="border-b border-slate-800 bg-slate-950/40">
              <tr>
                <th className={thClass}>Workspace</th>
                <th className={thClass}>Plan</th>
                <th className={thClass}>Users</th>
                <th className={thClass}>Msgs / mo</th>
                <th className={thClass}>Status</th>
                <th className={thClass}>Joined</th>
                <th className={cn(thClass, "text-right")}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {tenants.map((t) => {
                const limit =
                  t.messageLimit ?? PLAN_MSG_LIMIT[(t.plan ?? "STARTER").toUpperCase()] ?? 5_000;
                return (
                  <tr
                    key={t.id}
                    onClick={() => router.push(`/tenants/${t.id}`)}
                    className="cursor-pointer transition hover:bg-slate-800/40"
                  >
                    <td className={tdClass}>
                      <div className="flex items-center gap-3">
                        <Avatar name={t.name} src={t.logo} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-100">{t.name}</p>
                          <p className="truncate text-xs text-slate-500">/{t.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className={tdClass}>
                      <AdminBadge tone={planTone(t.plan)}>{t.plan ?? "—"}</AdminBadge>
                    </td>
                    <td className={tdClass}>{t.users ?? 0}</td>
                    <td className={tdClass}>
                      <UsageBar used={t.messagesThisMonth ?? 0} limit={limit} />
                      <p className="mt-0.5 text-[11px] text-slate-600">
                        of {formatCompact(limit)}
                      </p>
                    </td>
                    <td className={tdClass}>
                      <AdminBadge tone={t.isActive ? "emerald" : "rose"}>
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {t.isActive ? "Active" : "Suspended"}
                      </AdminBadge>
                    </td>
                    <td className={cn(tdClass, "text-slate-400")}>{formatDate(t.createdAt)}</td>
                    <td className={cn(tdClass, "relative text-right")}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuFor(menuFor === t.id ? null : t.id);
                        }}
                        aria-label={`Actions for ${t.name}`}
                        aria-expanded={menuFor === t.id}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>

                      {menuFor === t.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuFor(null);
                            }}
                            aria-hidden
                          />
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-4 top-11 z-20 w-48 overflow-hidden rounded-lg border border-slate-700 bg-slate-800 py-1 text-left shadow-xl"
                          >
                            <MenuItem
                              icon={Eye}
                              label="View details"
                              onClick={() => {
                                setMenuFor(null);
                                router.push(`/tenants/${t.id}`);
                              }}
                            />
                            <MenuItem
                              icon={RefreshCcw}
                              label="Change plan"
                              onClick={() => {
                                setMenuFor(null);
                                router.push(`/tenants/${t.id}?tab=plan`);
                              }}
                            />
                            <div className="my-1 border-t border-slate-700" />
                            {t.isActive ? (
                              <MenuItem
                                icon={Pause}
                                label="Suspend"
                                danger
                                onClick={() => {
                                  setMenuFor(null);
                                  updateTenant.mutate({ id: t.id, isActive: false });
                                }}
                              />
                            ) : (
                              <MenuItem
                                icon={Play}
                                label="Activate"
                                onClick={() => {
                                  setMenuFor(null);
                                  updateTenant.mutate({ id: t.id, isActive: true });
                                }}
                              />
                            )}
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </AdminTable>
        )}
      </AdminCard>

      <ProvisionModal open={provisionOpen} onClose={() => setProvisionOpen(false)} />
    </>
  );
}

// ─── Row action item ──────────────────────────────────────────────────────────

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-sm transition",
        danger
          ? "text-rose-300 hover:bg-rose-500/10"
          : "text-slate-300 hover:bg-slate-700 hover:text-white",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

// ─── Provision modal ──────────────────────────────────────────────────────────

function ProvisionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const provision = useProvisionTenant();
  const [form, setForm] = useState({
    name: "",
    slug: "",
    ownerEmail: "",
    plan: "starter",
    trialDays: 14,
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const slugify = (v: string) =>
    v
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    provision.mutate(
      { ...form, slug: form.slug || slugify(form.name) },
      {
        onSuccess: () => {
          setForm({ name: "", slug: "", ownerEmail: "", plan: "starter", trialDays: 14 });
          onClose();
        },
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Provision Tenant"
      description="Create a workspace manually — used for enterprise onboarding."
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Workspace name" htmlFor="t-name" required>
          <input
            id="t-name"
            value={form.name}
            onChange={(e) => {
              set("name", e.target.value);
              if (!form.slug) set("slug", slugify(e.target.value));
            }}
            required
            placeholder="Nova Realty"
            className={inputClass}
          />
        </Field>

        <Field label="Slug" htmlFor="t-slug" required>
          <input
            id="t-slug"
            value={form.slug}
            onChange={(e) => set("slug", slugify(e.target.value))}
            required
            placeholder="nova-realty"
            className={inputClass}
          />
        </Field>

        <Field label="Owner email" htmlFor="t-email" required>
          <input
            id="t-email"
            type="email"
            value={form.ownerEmail}
            onChange={(e) => set("ownerEmail", e.target.value)}
            required
            placeholder="owner@company.com"
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Plan" htmlFor="t-plan" required>
            <select
              id="t-plan"
              value={form.plan}
              onChange={(e) => set("plan", e.target.value)}
              className={inputClass}
            >
              <option value="starter">Starter — ₹999/mo</option>
              <option value="growth">Growth — ₹2,999/mo</option>
              <option value="enterprise">Enterprise — ₹9,999/mo</option>
            </select>
          </Field>

          <Field label="Trial days" htmlFor="t-trial">
            <input
              id="t-trial"
              type="number"
              min={0}
              max={90}
              value={form.trialDays}
              onChange={(e) => set("trialDays", Number(e.target.value))}
              className={inputClass}
            />
          </Field>
        </div>

        {provision.isError && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {(provision.error as Error).message}
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
            disabled={provision.isPending}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-50"
          >
            {provision.isPending ? "Provisioning…" : "Provision Tenant"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
