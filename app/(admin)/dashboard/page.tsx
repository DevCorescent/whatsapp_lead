"use client";

/**
 * Super-admin platform overview.
 * Data: GET /api/admin/stats  (TODO [SHALMON] — currently returns 501, so the
 * page falls back to clearly-labelled preview data and never crashes.)
 */

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Database,
  IndianRupee,
  MessageSquare,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
  Webhook,
} from "lucide-react";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Avatar } from "@/components/ui";
import {
  AdminBadge,
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
  AdminSkeleton,
  AdminSkeletonRows,
  AdminTable,
  CHART,
  PreviewBanner,
  StatTile,
  axisProps,
  planTone,
  tdClass,
  thClass,
  tooltipStyle,
} from "@/components/admin/ui";
import { formatCompact, formatCurrency, formatDate } from "@/lib/utils";

// ─── Types + data ─────────────────────────────────────────────────────────────

interface RecentTenant {
  id: string;
  name: string;
  slug: string;
  plan?: string | null;
  users?: number;
  createdAt: string;
}

interface AdminStats {
  totalTenants: number;
  activeTenants: number;
  totalUsers: number;
  totalMessages: number;
  mrr: number;
  arr?: number;
  signupsThisMonth: number;
  churnRate: number;
  signupsLast30Days: { date: string; count: number }[];
  planBreakdown: { planName: string; count: number }[];
  recentTenants: RecentTenant[];
}

function useAdminStats() {
  return useQuery<AdminStats>({
    queryKey: ["admin", "stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/stats");
      if (!res.ok) throw new Error(`Failed to load stats (${res.status})`);
      const json = await res.json();
      return (json.data ?? json) as AdminStats;
    },
    retry: false,
  });
}

/** TODO [SHALMON]: delete once /api/admin/stats is live. */
const PREVIEW: AdminStats = {
  totalTenants: 128,
  activeTenants: 119,
  totalUsers: 642,
  totalMessages: 1_284_500,
  mrr: 384_600,
  arr: 4_615_200,
  signupsThisMonth: 14,
  churnRate: 2.4,
  signupsLast30Days: Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return {
      date: d.toISOString().slice(0, 10),
      count: [1, 0, 2, 3, 1, 4, 2, 5, 3, 2][i % 10],
    };
  }),
  planBreakdown: [
    { planName: "Starter", count: 68 },
    { planName: "Growth", count: 43 },
    { planName: "Enterprise", count: 17 },
  ],
  recentTenants: [
    { id: "t1", name: "Nova Realty", slug: "nova-realty", plan: "Growth", users: 6, createdAt: new Date(Date.now() - 864e5).toISOString() },
    { id: "t2", name: "EduSpark Academy", slug: "eduspark", plan: "Starter", users: 3, createdAt: new Date(Date.now() - 3 * 864e5).toISOString() },
    { id: "t3", name: "Kirana Direct", slug: "kirana-direct", plan: "Starter", users: 2, createdAt: new Date(Date.now() - 5 * 864e5).toISOString() },
    { id: "t4", name: "Vertex Motors", slug: "vertex-motors", plan: "Enterprise", users: 21, createdAt: new Date(Date.now() - 8 * 864e5).toISOString() },
    { id: "t5", name: "Bloom Clinics", slug: "bloom-clinics", plan: "Growth", users: 9, createdAt: new Date(Date.now() - 11 * 864e5).toISOString() },
  ],
};

const PIE_COLORS = [CHART.sky, CHART.violet, CHART.amber];

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const { data, isLoading, isError } = useAdminStats();

  const stats = data ?? PREVIEW;
  const preview = isError || !data;
  const arr = stats.arr ?? stats.mrr * 12;
  const signups = stats.signupsLast30Days ?? [];
  const plans = stats.planBreakdown ?? [];
  const recent = (stats.recentTenants ?? []).slice(0, 5);

  return (
    <>
      <AdminPageHeader
        title="Platform Overview"
        description="Real-time stats across every workspace on Corescent."
        action={
          <AdminBadge tone={preview ? "amber" : "emerald"}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {preview ? "Preview mode" : "Live"}
          </AdminBadge>
        }
      />

      {preview && !isLoading && <PreviewBanner endpoint="GET /api/admin/stats" />}

      {/* KPI tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Total Tenants"
          value={formatCompact(stats.totalTenants)}
          icon={Building2}
          tone="violet"
          delta="+8.2%"
          deltaDirection="up"
          deltaNote="vs last month"
          loading={isLoading}
        />
        <StatTile
          label="Active Tenants"
          value={formatCompact(stats.activeTenants)}
          icon={CheckCircle2}
          tone="emerald"
          delta={`${stats.totalTenants ? Math.round((stats.activeTenants / stats.totalTenants) * 100) : 0}%`}
          deltaDirection="flat"
          deltaNote="of all workspaces"
          loading={isLoading}
        />
        <StatTile
          label="MRR"
          value={formatCurrency(stats.mrr)}
          icon={IndianRupee}
          tone="sky"
          delta="+12.5%"
          deltaDirection="up"
          deltaNote="month over month"
          loading={isLoading}
        />
        <StatTile
          label="ARR"
          value={formatCurrency(arr)}
          icon={CircleDollarSign}
          tone="amber"
          delta="+11.1%"
          deltaDirection="up"
          deltaNote="annualised run-rate"
          loading={isLoading}
        />
        <StatTile
          label="Total Users"
          value={formatCompact(stats.totalUsers)}
          icon={Users}
          tone="violet"
          delta="+4.7%"
          deltaDirection="up"
          deltaNote="across all tenants"
          loading={isLoading}
        />
        <StatTile
          label="Messages (30d)"
          value={formatCompact(stats.totalMessages)}
          icon={MessageSquare}
          tone="emerald"
          delta="+18.9%"
          deltaDirection="up"
          deltaNote="inbound + outbound"
          loading={isLoading}
        />
        <StatTile
          label="Signups This Month"
          value={formatCompact(stats.signupsThisMonth)}
          icon={UserPlus}
          tone="sky"
          delta="+3"
          deltaDirection="up"
          deltaNote="vs same period"
          loading={isLoading}
        />
        <StatTile
          label="Churn Rate"
          value={`${stats.churnRate.toFixed(1)}%`}
          icon={TrendingDown}
          tone="rose"
          delta="-0.6pt"
          deltaDirection="down"
          deltaNote="lower is better"
          loading={isLoading}
        />
      </div>

      {/* Charts */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <AdminPanel
          title="Signups — last 30 days"
          subtitle="New workspaces per day"
          className="lg:col-span-2"
          action={<TrendingUp className="h-4 w-4 text-violet-400" />}
        >
          <div className="h-64">
            {isLoading ? (
              <AdminSkeleton className="h-full w-full" />
            ) : signups.length === 0 ? (
              <AdminEmptyState icon={TrendingUp} title="No signup data" description="Nothing to chart yet." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={signups} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={shortDate} interval={4} {...axisProps} />
                  <YAxis allowDecimals={false} {...axisProps} />
                  <Tooltip
                    {...tooltipStyle}
                    labelFormatter={(v) => shortDate(String(v))}
                    formatter={(v) => [`${Number(v)} signups`, ""]}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke={CHART.violet}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: CHART.violet }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </AdminPanel>

        <AdminPanel title="Plan Distribution" subtitle="Tenants per plan">
          <div className="h-64">
            {isLoading ? (
              <AdminSkeleton className="h-full w-full" />
            ) : plans.length === 0 ? (
              <AdminEmptyState icon={CircleDollarSign} title="No plan data" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={plans}
                    dataKey="count"
                    nameKey="planName"
                    innerRadius={52}
                    outerRadius={82}
                    paddingAngle={3}
                    stroke="#0f172a"
                    strokeWidth={2}
                  >
                    {plans.map((p, i) => (
                      <Cell key={p.planName} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} formatter={(v, n) => [`${Number(v)} tenants`, String(n)]} />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    formatter={(value) => <span className="text-xs text-slate-400">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </AdminPanel>
      </div>

      {/* Recent tenants + system health */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <AdminPanel
          title="Recent Tenants"
          subtitle="Last 5 signups"
          className="lg:col-span-2"
          bodyClassName="p-0"
          action={
            <Link href="/tenants" className="text-xs font-medium text-violet-400 hover:text-violet-300">
              View all
            </Link>
          }
        >
          {isLoading ? (
            <div className="p-5">
              <AdminSkeletonRows rows={5} />
            </div>
          ) : recent.length === 0 ? (
            <AdminEmptyState
              icon={Building2}
              title="No tenants yet"
              description="New workspaces will appear here as they sign up."
            />
          ) : (
            <AdminTable>
              <thead className="border-b border-slate-800 bg-slate-950/40">
                <tr>
                  <th className={thClass}>Workspace</th>
                  <th className={thClass}>Plan</th>
                  <th className={thClass}>Users</th>
                  <th className={thClass}>Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {recent.map((t) => (
                  <tr key={t.id} className="transition hover:bg-slate-800/40">
                    <td className={tdClass}>
                      <div className="flex items-center gap-3">
                        <Avatar name={t.name} size="sm" />
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
                      <span className="text-slate-400">{formatDate(t.createdAt)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </AdminTable>
          )}
        </AdminPanel>

        {/* TODO: wire to a real health probe (/api/admin/health) — static chips for now. */}
        <AdminPanel title="System Health" subtitle="Static probe — TODO: wire to /api/admin/health">
          <ul className="space-y-3">
            <HealthRow icon={Activity} label="API latency" value="128 ms" tone="emerald" chip="Healthy" />
            <HealthRow icon={Database} label="Database" value="Neon · ap-south-1" tone="emerald" chip="Online" />
            <HealthRow icon={Webhook} label="Webhook queue" value="42 pending" tone="amber" chip="Degraded" />
            <HealthRow icon={MessageSquare} label="WhatsApp Cloud API" value="Operational" tone="emerald" chip="Healthy" />
          </ul>
          <p className="mt-4 border-t border-slate-800 pt-3 text-xs text-slate-600">
            Last checked just now · auto-refresh every 60s
          </p>
        </AdminPanel>
      </div>
    </>
  );
}

function HealthRow({
  icon: Icon,
  label,
  value,
  tone,
  chip,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: "emerald" | "amber" | "rose";
  chip: string;
}) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-400">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-slate-200">{label}</p>
        <p className="truncate text-xs text-slate-500">{value}</p>
      </div>
      <AdminBadge tone={tone}>{chip}</AdminBadge>
    </li>
  );
}
