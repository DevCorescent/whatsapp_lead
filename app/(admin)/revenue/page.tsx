"use client";

/**
 * Revenue analytics (SUPER_ADMIN).
 * Data: GET /api/admin/revenue — TODO [SHALMON]: endpoint does not exist yet, so the page
 * renders clearly-labelled preview figures and switches to live data the moment it ships.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  BadgeIndianRupee,
  CircleDollarSign,
  CreditCard,
  IndianRupee,
  RefreshCcw,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AdminBadge,
  AdminButton,
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
  AdminSkeleton,
  AdminSkeletonRows,
  AdminTable,
  CHART,
  PreviewBanner,
  Segmented,
  StatTile,
  axisProps,
  tdClass,
  thClass,
  tooltipStyle,
  type AdminTone,
} from "@/components/admin/ui";
import { cn, formatCompact, formatCurrency, formatDate } from "@/lib/utils";

// ─── Types + data ─────────────────────────────────────────────────────────────

type Range = "3m" | "6m" | "12m";

type Gateway = "RAZORPAY" | "STRIPE";
type TxStatus = "PAID" | "PENDING" | "FAILED";

interface Transaction {
  id: string;
  tenant: string;
  plan: string;
  amount: number;
  gateway: Gateway;
  status: TxStatus;
  date: string;
}

interface RevenueData {
  mrr: number;
  arr: number;
  arpu: number;
  ltv: number;
  trend: { month: string; mrr: number }[];
  byPlan: { month: string; starter: number; growth: number; enterprise: number }[];
  transactions: Transaction[];
  failed: Transaction[];
}

function useRevenue(range: Range) {
  return useQuery<RevenueData>({
    queryKey: ["admin", "revenue", range],
    queryFn: async () => {
      const res = await fetch(`/api/admin/revenue?range=${range}`);
      if (!res.ok) throw new Error(`Failed to load revenue (${res.status})`);
      const json = await res.json();
      return (json.data ?? json) as RevenueData;
    },
    retry: false,
  });
}

const MONTHS = ["Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"];

/** TODO [SHALMON]: delete once /api/admin/revenue is live. */
const PREVIEW: RevenueData = {
  mrr: 384_600,
  arr: 4_615_200,
  arpu: 3_232,
  ltv: 41_800,
  trend: MONTHS.map((month, i) => ({ month, mrr: 176_000 + i * 19_000 + (i % 3) * 6_500 })),
  byPlan: MONTHS.map((month, i) => ({
    month,
    starter: 42_000 + i * 2_400,
    growth: 88_000 + i * 9_100,
    enterprise: 46_000 + i * 7_500,
  })),
  transactions: [
    { id: "tx1", tenant: "Vertex Motors", plan: "Enterprise", amount: 9999, gateway: "RAZORPAY", status: "PAID", date: new Date(Date.now() - 2 * 864e5).toISOString() },
    { id: "tx2", tenant: "Nova Realty", plan: "Growth", amount: 2999, gateway: "STRIPE", status: "PAID", date: new Date(Date.now() - 3 * 864e5).toISOString() },
    { id: "tx3", tenant: "Bloom Clinics", plan: "Growth", amount: 2999, gateway: "RAZORPAY", status: "PENDING", date: new Date(Date.now() - 4 * 864e5).toISOString() },
    { id: "tx4", tenant: "EduSpark Academy", plan: "Starter", amount: 999, gateway: "RAZORPAY", status: "PAID", date: new Date(Date.now() - 6 * 864e5).toISOString() },
    { id: "tx5", tenant: "Kirana Direct", plan: "Starter", amount: 999, gateway: "STRIPE", status: "FAILED", date: new Date(Date.now() - 7 * 864e5).toISOString() },
    { id: "tx6", tenant: "Zen Interiors", plan: "Growth", amount: 2999, gateway: "RAZORPAY", status: "PAID", date: new Date(Date.now() - 9 * 864e5).toISOString() },
  ],
  failed: [
    { id: "f1", tenant: "Kirana Direct", plan: "Starter", amount: 999, gateway: "STRIPE", status: "FAILED", date: new Date(Date.now() - 7 * 864e5).toISOString() },
    { id: "f2", tenant: "Peak Fitness", plan: "Growth", amount: 2999, gateway: "RAZORPAY", status: "FAILED", date: new Date(Date.now() - 12 * 864e5).toISOString() },
  ],
};

const STATUS_TONE: Record<TxStatus, AdminTone> = {
  PAID: "emerald",
  PENDING: "amber",
  FAILED: "rose",
};

const RANGES: { value: Range; label: string }[] = [
  { value: "3m", label: "3 months" },
  { value: "6m", label: "6 months" },
  { value: "12m", label: "12 months" },
];

const sliceFor = (range: Range) => (range === "3m" ? -3 : range === "6m" ? -6 : -12);

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminRevenuePage() {
  const [range, setRange] = useState<Range>("12m");
  const { data, isLoading, isError } = useRevenue(range);

  const rev = data ?? PREVIEW;
  const preview = isError || !data;
  const n = sliceFor(range);
  const trend = (rev.trend ?? []).slice(n);
  const byPlan = (rev.byPlan ?? []).slice(n);
  const transactions = rev.transactions ?? [];
  const failed = rev.failed ?? [];

  return (
    <>
      <AdminPageHeader
        title="Revenue"
        description="Subscription and billing analytics across the platform."
        action={<Segmented options={RANGES} value={range} onChange={setRange} />}
      />

      {preview && !isLoading && <PreviewBanner endpoint="GET /api/admin/revenue" />}

      {/* KPI tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="MRR"
          value={formatCurrency(rev.mrr)}
          icon={IndianRupee}
          tone="violet"
          delta="+12.5%"
          deltaDirection="up"
          deltaNote="vs last month"
          loading={isLoading}
        />
        <StatTile
          label="ARR"
          value={formatCurrency(rev.arr)}
          icon={CircleDollarSign}
          tone="emerald"
          delta="+11.1%"
          deltaDirection="up"
          deltaNote="annualised"
          loading={isLoading}
        />
        <StatTile
          label="ARPU"
          value={formatCurrency(rev.arpu)}
          icon={Users}
          tone="sky"
          delta="+2.1%"
          deltaDirection="up"
          deltaNote="per tenant / month"
          loading={isLoading}
        />
        <StatTile
          label="LTV"
          value={formatCurrency(rev.ltv)}
          icon={BadgeIndianRupee}
          tone="amber"
          delta="+5.8%"
          deltaDirection="up"
          deltaNote="avg lifetime value"
          loading={isLoading}
        />
      </div>

      {/* MRR trend */}
      <AdminPanel
        title="MRR — last 12 months"
        subtitle="Monthly recurring revenue"
        className="mt-6"
        action={<TrendingUp className="h-4 w-4 text-[#0B6E4F]" />}
      >
        <div className="h-72">
          {isLoading ? (
            <AdminSkeleton className="h-full w-full" />
          ) : trend.length === 0 ? (
            <AdminEmptyState icon={TrendingUp} title="No revenue data" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" {...axisProps} />
                <YAxis tickFormatter={(v) => formatCompact(Number(v))} {...axisProps} />
                <Tooltip {...tooltipStyle} formatter={(v) => [formatCurrency(Number(v)), "MRR"]} />
                <Line
                  type="monotone"
                  dataKey="mrr"
                  stroke={CHART.violet}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, fill: CHART.violet }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </AdminPanel>

      {/* Revenue by plan + failed payments */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <AdminPanel title="Revenue by plan" subtitle="Stacked, per month" className="lg:col-span-2">
          <div className="h-72">
            {isLoading ? (
              <AdminSkeleton className="h-full w-full" />
            ) : byPlan.length === 0 ? (
              <AdminEmptyState icon={CreditCard} title="No plan revenue yet" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byPlan} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" {...axisProps} />
                  <YAxis tickFormatter={(v) => formatCompact(Number(v))} {...axisProps} />
                  <Tooltip {...tooltipStyle} formatter={(v, name) => [formatCurrency(Number(v)), String(name)]} />
                  <Legend
                    iconType="circle"
                    formatter={(value) => (
                      <span className="text-xs capitalize text-slate-500">{value}</span>
                    )}
                  />
                  <Bar dataKey="starter" stackId="rev" fill={CHART.sky} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="growth" stackId="rev" fill={CHART.violet} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="enterprise" stackId="rev" fill={CHART.amber} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </AdminPanel>

        <AdminPanel
          title="Failed Payments"
          subtitle="Needs attention"
          action={
            <AdminBadge tone={failed.length > 0 ? "rose" : "emerald"}>
              {failed.length} open
            </AdminBadge>
          }
        >
          {isLoading ? (
            <AdminSkeletonRows rows={3} />
          ) : failed.length === 0 ? (
            <AdminEmptyState
              icon={AlertCircle}
              title="All payments settled"
              description="No failed charges in this period."
            />
          ) : (
            <ul className="space-y-3">
              {failed.map((f) => (
                <li
                  key={f.id}
                  className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{f.tenant}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {f.plan} · {formatDate(f.date)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-rose-700">
                      {formatCurrency(f.amount)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <AdminBadge tone={f.gateway === "STRIPE" ? "sky" : "violet"}>
                      {f.gateway === "STRIPE" ? "Stripe" : "Razorpay"}
                    </AdminBadge>
                    <AdminButton size="sm" variant="secondary">
                      <RefreshCcw className="h-3.5 w-3.5" />
                      Retry charge
                    </AdminButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AdminPanel>
      </div>

      {/* Transactions */}
      <AdminPanel
        title="Recent Transactions"
        subtitle="Latest subscription charges"
        className="mt-6"
        bodyClassName="p-0"
      >
        {isLoading ? (
          <div className="p-5">
            <AdminSkeletonRows rows={6} />
          </div>
        ) : transactions.length === 0 ? (
          <AdminEmptyState
            icon={CreditCard}
            title="No transactions"
            description="Charges will appear here once billing is live."
          />
        ) : (
          <AdminTable>
            <thead className="border-b border-slate-200 bg-[#FAFAFA]">
              <tr>
                <th className={thClass}>Tenant</th>
                <th className={thClass}>Plan</th>
                <th className={thClass}>Amount</th>
                <th className={thClass}>Gateway</th>
                <th className={thClass}>Status</th>
                <th className={thClass}>Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {transactions.map((t) => (
                <tr key={t.id} className="transition hover:bg-slate-50">
                  <td className={cn(tdClass, "font-medium text-slate-900")}>{t.tenant}</td>
                  <td className={tdClass}>{t.plan}</td>
                  <td className={cn(tdClass, "font-semibold text-slate-900")}>
                    {formatCurrency(t.amount)}
                  </td>
                  <td className={tdClass}>
                    <AdminBadge tone={t.gateway === "STRIPE" ? "sky" : "violet"}>
                      {t.gateway === "STRIPE" ? "Stripe" : "Razorpay"}
                    </AdminBadge>
                  </td>
                  <td className={tdClass}>
                    <AdminBadge tone={STATUS_TONE[t.status]}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {t.status.charAt(0) + t.status.slice(1).toLowerCase()}
                    </AdminBadge>
                  </td>
                  <td className={cn(tdClass, "text-slate-500")}>{formatDate(t.date)}</td>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        )}
      </AdminPanel>
    </>
  );
}