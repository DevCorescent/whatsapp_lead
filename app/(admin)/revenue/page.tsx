"use client";

/**
 * Revenue analytics (SUPER_ADMIN).
 *
 * Data: GET /api/admin/revenue. Everything on this page is real — contracted MRR from
 * plan prices on live subscriptions, and transactions from Stripe. When the endpoint
 * fails the page says so and shows nothing: a placeholder dataset here once meant an
 * outage looked like ₹3.8L of revenue and six invented customers.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  BadgeIndianRupee,
  CircleDollarSign,
  CreditCard,
  IndianRupee,
  ChevronDown,
  Download,
  FileSpreadsheet,
  Loader2,
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
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
  AdminSkeleton,
  AdminSkeletonRows,
  AdminTable,
  CHART,
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
  /** Whether Stripe could be read. Absent on responses from before this was reported. */
  collected?: {
    available: boolean;
    unavailableReason: string | null;
    totalTransactions: number;
  };
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

// ─── Export ───────────────────────────────────────────────────────────────────

type ExportFormat = "xlsx" | "csv";

/**
 * Download the report for the period currently on screen.
 *
 * The file is fetched rather than linked to, so a failure surfaces as a message on
 * this page instead of navigating the operator to a JSON error body. The filename
 * the server chose is preserved, and a second click is ignored while one is in
 * flight — generating the report costs a Stripe round trip.
 */
function useRevenueExport(range: Range) {
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (format: ExportFormat) => {
    if (busy) return;
    setBusy(format);
    setError(null);
    try {
      const res = await fetch(`/api/admin/revenue/export?format=${format}&range=${range}`);
      if (!res.ok) {
        const message = await res
          .json()
          .then((j) => j?.error as string | undefined)
          .catch(() => undefined);
        throw new Error(message ?? `Export failed (${res.status})`);
      }

      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filename =
        /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? `revenue-report.${format}`;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoked on the next tick: revoking synchronously can cancel the download
      // in some browsers before it has read the blob.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not export the revenue report");
    } finally {
      setBusy(null);
    }
  };

  return { run, busy, error };
}

/**
 * One Export button; the format is chosen from its menu.
 *
 * Both formats stay available — the report is the same data either way, and a CSV
 * is what anyone feeding this into a spreadsheet pipeline actually wants — but
 * they no longer take up two slots in a header that also holds the period switch.
 *
 * The menu closes on choose, on outside click and on Escape. While a file is
 * being prepared the button reports it and refuses a second click: each export
 * costs a Stripe round trip.
 */
function ExportMenu({ range }: { range: Range }) {
  const { run, busy, error } = useRevenueExport(range);
  const [open, setOpen] = useState(false);

  const choose = (format: ExportFormat) => {
    setOpen(false);
    void run(format);
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="relative">
        <AdminButton
          variant="secondary"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          disabled={busy !== null}
          aria-busy={busy !== null}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Download className="h-3.5 w-3.5" aria-hidden />
          )}
          {busy ? "Preparing…" : "Export"}
          {!busy && <ChevronDown className={cn("h-3.5 w-3.5 transition", open && "rotate-180")} aria-hidden />}
        </AdminButton>

        {open && (
          <>
            {/* Catches the click that dismisses the menu, so it cannot also hit
                whatever sits behind it. */}
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
            <div
              role="menu"
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
              }}
              className="absolute right-0 top-9 z-20 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-left shadow-lg"
            >
              <button
                role="menuitem"
                onClick={() => choose("xlsx")}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden />
                Excel (.xlsx)
              </button>
              <button
                role="menuitem"
                onClick={() => choose("csv")}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
              >
                <Download className="h-4 w-4" aria-hidden />
                CSV (.csv)
              </button>
            </div>
          </>
        )}
      </div>

      <p role="alert" className="empty:hidden text-xs text-rose-600">
        {error}
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminRevenuePage() {
  const [range, setRange] = useState<Range>("12m");
  const { data, isLoading, isError, error, refetch, isFetching } = useRevenue(range);

  // No placeholder dataset: an empty page is honest, invented revenue is not.
  const rev = data;
  const n = sliceFor(range);
  const trend = (rev?.trend ?? []).slice(n);
  const byPlan = (rev?.byPlan ?? []).slice(n);
  const transactions = rev?.transactions ?? [];
  const failed = rev?.failed ?? [];
  const collected = rev?.collected;
  // Stripe is the source for transactions; distinguish "none happened" from "could not ask".
  const stripeUnavailable = collected?.available === false;

  return (
    <>
      <AdminPageHeader
        title="Revenue"
        description="Subscription and billing analytics across the platform."
        action={
          <div className="flex flex-wrap items-center gap-3">
            {/* Exports follow the period selected here — 3, 6 or 12 months. */}
            <Segmented options={RANGES} value={range} onChange={setRange} />
            <ExportMenu range={range} />
          </div>
        }
      />

      {isError && (
        <AdminCard className="mb-6 border-rose-200 bg-rose-50">
          <div className="flex items-start gap-3 p-5 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden />
            <div className="min-w-0">
              <p className="font-semibold">Revenue data could not be loaded</p>
              <p className="mt-0.5 text-rose-700">
                {error instanceof Error ? error.message : "GET /api/admin/revenue failed."}{" "}
                No figures are shown rather than estimates.
              </p>
              <AdminButton
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => void refetch()}
                disabled={isFetching}
              >
                <RefreshCcw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} aria-hidden />
                {isFetching ? "Retrying…" : "Retry"}
              </AdminButton>
            </div>
          </div>
        </AdminCard>
      )}

      {/* KPI tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="MRR"
          value={formatCurrency(rev?.mrr)}
          icon={IndianRupee}
          tone="violet"
          loading={isLoading}
        />
        <StatTile
          label="ARR"
          value={formatCurrency(rev?.arr)}
          icon={CircleDollarSign}
          tone="emerald"
          loading={isLoading}
        />
        <StatTile
          label="ARPU"
          value={formatCurrency(rev?.arpu)}
          icon={Users}
          tone="sky"
          loading={isLoading}
        />
        <StatTile
          label="LTV"
          value={formatCurrency(rev?.ltv)}
          icon={BadgeIndianRupee}
          tone="amber"
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
              title={stripeUnavailable ? "Payment data unavailable" : "All payments settled"}
              description={
                stripeUnavailable
                  ? (collected?.unavailableReason ?? "Stripe could not be queried.")
                  : "No failed charges in this period."
              }
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
            icon={stripeUnavailable ? AlertCircle : CreditCard}
            title={stripeUnavailable ? "Transactions unavailable" : "No transactions"}
            description={
              stripeUnavailable
                ? (collected?.unavailableReason ??
                  "Stripe could not be queried, so payments cannot be shown. This is not the same as no revenue.")
                : "Stripe returned no charges for this period."
            }
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