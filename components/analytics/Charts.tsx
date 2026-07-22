"use client";

import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
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
import { BarChart2 } from "lucide-react";
import { Avatar, Card, EmptyState, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useLeadStages } from "@/hooks/useLeadStages";

// ─── Palette ──────────────────────────────────────────────────────────────────
// Validated for CVD separation, chroma and contrast against a white surface.
// `slate` is chrome only (grid / axis / muted ink) — never a data series, as it
// falls below the chroma floor and would read as "no data".

export const CHART_COLORS = {
  emerald: "#059669",
  sky: "#0284c7",
  violet: "#7c3aed",
  amber: "#d97706",
  rose: "#e11d48",
  slate: "#64748b",
} as const;

const GRID = "#e2e8f0"; // slate-200
const AXIS_INK = "#94a3b8"; // slate-400

const AXIS_PROPS = {
  tick: { fill: AXIS_INK, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: GRID },
} as const;

const TOOLTIP_PROPS = {
  contentStyle: {
    borderRadius: 12,
    border: `1px solid ${GRID}`,
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
    fontSize: 12,
    padding: "8px 12px",
  },
  labelStyle: { color: "#0f172a", fontWeight: 600, marginBottom: 4 },
  itemStyle: { padding: 0 },
} as const;

const LEGEND_PROPS = {
  iconType: "circle",
  iconSize: 8,
  wrapperStyle: { fontSize: 12, paddingTop: 8 },
} as const;

// ─── Data contracts ───────────────────────────────────────────────────────────
// Everything is optional: /api/analytics is still a 501 stub, so the page is
// built to render fully against `undefined`.

export interface MessagePoint {
  date: string;
  sent: number;
  received: number;
}

export interface StagePoint {
  stage: string;
  count: number;
  value?: number;
}

export interface ScorePoint {
  label: string;
  count: number;
}

export interface CampaignPoint {
  campaign: string;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
}

export interface AgentRow {
  id?: string;
  agent: string;
  avatar?: string | null;
  conversations: number;
  avgResponseTime: number;
  resolved: number;
}

export interface AnalyticsData {
  totalConversations?: number | null;
  openConversations?: number | null;
  resolvedToday?: number | null;
  totalMessages?: number | null;
  avgResponseTimeMinutes?: number | null;
  totalLeads?: number | null;
  wonDeals?: number | null;
  conversionRate?: number | null;
  /** Optional period-over-period deltas, keyed by the KPI field name. */
  deltas?: Record<string, number | null | undefined>;
  messagesChart?: MessagePoint[] | null;
  leadsByStage?: StagePoint[] | null;
  scoreDistribution?: ScorePoint[] | null;
  campaignPerformance?: CampaignPoint[] | null;
  agentPerformance?: AgentRow[] | null;
}

function hasRows<T>(rows?: T[] | null): rows is T[] {
  return Array.isArray(rows) && rows.length > 0;
}

// ─── Card shell ───────────────────────────────────────────────────────────────

const CHART_BODY_H = "h-[300px]";

/** Bars of varying height read as "a chart is loading", not "a box is loading". */
function ChartSkeleton() {
  return (
    <div className="flex h-full items-end gap-3 px-3 pb-8">
      {[45, 70, 38, 85, 58, 92, 50, 75].map((h, i) => (
        <div
          key={i}
          className="flex-1 animate-pulse rounded-t-md bg-slate-200"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  loading,
  empty,
  children,
}: {
  title: string;
  subtitle: string;
  loading?: boolean;
  empty?: boolean;
  children: ReactNode;
}) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
      </div>

      {/* Fixed height: ResponsiveContainer collapses to 0px without one. */}
      <div className={cn("relative w-full p-2", CHART_BODY_H)}>
        {loading ? (
          <ChartSkeleton />
        ) : empty ? (
          <EmptyState
            icon={BarChart2}
            title="No data yet"
            description="/api/analytics is not wired up yet — this chart fills in automatically once the endpoint returns data."
            className="h-full py-0"
          />
        ) : (
          children
        )}
      </div>
    </Card>
  );
}

// ─── 1. Messages over time ────────────────────────────────────────────────────

export function MessagesOverTimeChart({
  data,
  loading,
}: {
  data?: MessagePoint[] | null;
  loading?: boolean;
}) {
  const rows = hasRows(data) ? data : [];

  return (
    <ChartCard
      title="Messages Over Time"
      subtitle="Outbound vs inbound message volume"
      loading={loading}
      empty={rows.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="date" {...AXIS_PROPS} />
          <YAxis allowDecimals={false} {...AXIS_PROPS} />
          <Tooltip cursor={{ stroke: GRID, strokeWidth: 1 }} {...TOOLTIP_PROPS} />
          <Legend {...LEGEND_PROPS} />
          <Line
            type="monotone"
            dataKey="sent"
            name="Sent"
            stroke={CHART_COLORS.emerald}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
          />
          <Line
            type="monotone"
            dataKey="received"
            name="Received"
            stroke={CHART_COLORS.sky}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ─── 2. Lead pipeline distribution ────────────────────────────────────────────

export function LeadPipelineChart({
  data,
  loading,
}: {
  data?: StagePoint[] | null;
  loading?: boolean;
}) {
  const counts = new Map((data ?? []).map((r) => [r.stage, r.count]));

  // The tenant's stage config drives both the order (funnel order, not data order)
  // and the labels — same source as the pipeline.
  const { stages } = useLeadStages();
  const rows = hasRows(data)
    ? stages.map((s) => ({ name: s.label, count: counts.get(s.key) ?? 0 }))
    : [];

  return (
    <ChartCard
      title="Lead Pipeline Distribution"
      subtitle="Leads currently sitting in each stage"
      loading={loading}
      empty={rows.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 22, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis
            dataKey="name"
            interval={0}
            angle={-25}
            textAnchor="end"
            height={52}
            {...AXIS_PROPS}
          />
          <YAxis allowDecimals={false} {...AXIS_PROPS} />
          <Tooltip cursor={{ fill: "#f8fafc" }} {...TOOLTIP_PROPS} />
          {/* One series → one hue. Colouring each bar by its value would double-
              encode length as hue and burn the only free channel. */}
          <Bar
            dataKey="count"
            name="Leads"
            fill={CHART_COLORS.emerald}
            radius={[4, 4, 0, 0]}
            maxBarSize={38}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ─── 3. Lead score distribution (donut) ───────────────────────────────────────

const SCORE_ORDER = ["COLD", "WARM", "HOT", "QUALIFIED"] as const;

const SCORE_COLOR: Record<string, string> = {
  COLD: CHART_COLORS.sky,
  WARM: CHART_COLORS.amber,
  HOT: CHART_COLORS.rose,
  QUALIFIED: CHART_COLORS.emerald,
};

export function LeadScoreDonut({
  data,
  loading,
}: {
  data?: ScorePoint[] | null;
  loading?: boolean;
}) {
  const counts = new Map((data ?? []).map((r) => [r.label, r.count]));

  // `fill` is read straight off each datum by Recharts — no deprecated <Cell>.
  const rows = hasRows(data)
    ? SCORE_ORDER.map((label) => ({
        label,
        count: counts.get(label) ?? 0,
        fill: SCORE_COLOR[label],
      }))
    : [];

  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <ChartCard
      title="Lead Score Distribution"
      subtitle="How qualified the pipeline is right now"
      loading={loading}
      empty={rows.length === 0}
    >
      <div className="flex h-full items-center gap-2">
        <div className="relative h-full flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 4, right: 0, bottom: 4, left: 0 }}>
              <Tooltip {...TOOLTIP_PROPS} />
              <Pie
                data={rows}
                dataKey="count"
                nameKey="label"
                innerRadius="58%"
                outerRadius="82%"
                paddingAngle={2}
                stroke="#fff"
                strokeWidth={2}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Hero figure in the hole — the number the donut is really about. */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-semibold tracking-tight text-slate-900">{total}</span>
            <span className="text-[11px] font-medium text-slate-400">Leads</span>
          </div>
        </div>

        {/* Custom legend: identity is never colour-alone — label + count too. */}
        <ul className="w-32 shrink-0 space-y-2 pr-3">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-2 text-xs">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: r.fill }}
                aria-hidden
              />
              <span className="flex-1 font-medium text-slate-600">{r.label}</span>
              <span className="font-semibold tabular-nums text-slate-900">{r.count}</span>
            </li>
          ))}
        </ul>
      </div>
    </ChartCard>
  );
}

// ─── 4. Campaign performance ──────────────────────────────────────────────────

export function CampaignPerformanceChart({
  data,
  loading,
}: {
  data?: CampaignPoint[] | null;
  loading?: boolean;
}) {
  const rows = hasRows(data) ? data : [];

  return (
    <ChartCard
      title="Campaign Performance"
      subtitle="Delivery funnel per campaign"
      loading={loading}
      empty={rows.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="campaign" {...AXIS_PROPS} />
          <YAxis allowDecimals={false} {...AXIS_PROPS} />
          <Tooltip cursor={{ fill: "#f8fafc" }} {...TOOLTIP_PROPS} />
          <Legend {...LEGEND_PROPS} />
          <Bar dataKey="sent" name="Sent" fill={CHART_COLORS.emerald} radius={[3, 3, 0, 0]} maxBarSize={18} />
          <Bar dataKey="delivered" name="Delivered" fill={CHART_COLORS.sky} radius={[3, 3, 0, 0]} maxBarSize={18} />
          <Bar dataKey="read" name="Read" fill={CHART_COLORS.violet} radius={[3, 3, 0, 0]} maxBarSize={18} />
          <Bar dataKey="replied" name="Replied" fill={CHART_COLORS.amber} radius={[3, 3, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ─── 5. Agent performance table ───────────────────────────────────────────────

function fmtMinutes(mins?: number | null) {
  if (mins == null || !Number.isFinite(mins)) return "—";
  if (mins < 60) return `${Math.round(mins)}m`;
  return `${(mins / 60).toFixed(1)}h`;
}

export function AgentPerformanceTable({
  data,
  loading,
}: {
  data?: AgentRow[] | null;
  loading?: boolean;
}) {
  const rows = hasRows(data) ? data : [];

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Agent Performance</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Conversation load and resolution rate per agent
        </p>
      </div>

      {loading ? (
        <div className="p-5">
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={BarChart2}
          title="No agent activity yet"
          description="/api/analytics is not wired up yet — agent stats appear here once it returns data."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-160 text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                <th className="px-5 py-2.5 font-medium">Agent</th>
                <th className="px-5 py-2.5 text-right font-medium">Conversations</th>
                <th className="px-5 py-2.5 text-right font-medium">Avg Response</th>
                <th className="px-5 py-2.5 text-right font-medium">Resolved</th>
                <th className="w-48 px-5 py-2.5 font-medium">Resolution Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r, i) => {
                const rate =
                  r.conversations > 0
                    ? Math.min(100, Math.round((r.resolved / r.conversations) * 100))
                    : 0;
                return (
                  <tr key={r.id ?? `${r.agent}-${i}`} className="transition hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={r.agent} src={r.avatar} size="sm" />
                        <span className="font-medium text-slate-900">{r.agent}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-600">
                      {r.conversations}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-600">
                      {fmtMinutes(r.avgResponseTime)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-600">
                      {r.resolved}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-emerald-600"
                            style={{ width: `${rate}%` }}
                          />
                        </div>
                        <span className="w-9 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-700">
                          {rate}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
