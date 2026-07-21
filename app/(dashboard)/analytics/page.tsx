"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  Download,
  Inbox,
  MessageSquare,
  Percent,
  Send,
  Target,
  Trophy,
} from "lucide-react";
import { Button, PageHeader } from "@/components/ui";
import { KpiCard } from "@/components/analytics/KpiCard";
import {
  AgentPerformanceTable,
  CampaignPerformanceChart,
  LeadPipelineChart,
  LeadScoreDonut,
  MessagesOverTimeChart,
  type AnalyticsData,
} from "@/components/analytics/Charts";
import { cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";

// ─── Period filter ────────────────────────────────────────────────────────────

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "90d", label: "90 Days" },
] as const;

type Period = (typeof PERIODS)[number]["value"];

// ─── Data ─────────────────────────────────────────────────────────────────────

/**
 * Lives here rather than in `hooks/` — that directory is owned by the API team.
 *
 * `GET /api/analytics` is still a 501 stub, so a rejected query is the *expected*
 * path today, not an exception. `retry: false` keeps it from hammering a route we
 * know is not implemented, and every consumer below reads the payload defensively
 * so the page renders complete against `undefined`.
 */
function useAnalytics(period: Period) {
  return useQuery<AnalyticsData>({
    queryKey: ["analytics", period],
    queryFn: async () => {
      const res = await fetch(`/api/analytics?period=${period}`);
      if (!res.ok) throw new Error(`Failed to fetch analytics (${res.status})`);
      const json: unknown = await res.json();
      // Tolerate both a bare object and the { success, data } envelope.
      if (json && typeof json === "object" && "data" in json) {
        return (json as { data: AnalyticsData }).data ?? {};
      }
      return (json ?? {}) as AnalyticsData;
    },
    retry: false,
    staleTime: 60_000,
    // Hold the previous slice while a new period loads — no skeleton flash.
    placeholderData: keepPreviousData,
  });
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const int = (v?: number | null) =>
  v == null || !Number.isFinite(v) ? null : new Intl.NumberFormat("en-IN").format(v);

const pct = (v?: number | null) =>
  v == null || !Number.isFinite(v) ? null : `${v.toFixed(1)}%`;

const mins = (v?: number | null) => {
  if (v == null || !Number.isFinite(v)) return null;
  if (v < 60) return `${Math.round(v)}m`;
  return `${(v / 60).toFixed(1)}h`;
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const { data, isLoading, isFetching } = useAnalytics(period);

  const d = data?.deltas;

  function handleExportCsv() {
    const kpiRows = [
      { metric: "Total Conversations", value: data?.totalConversations ?? "" },
      { metric: "Open Conversations", value: data?.openConversations ?? "" },
      { metric: "Resolved Today", value: data?.resolvedToday ?? "" },
      { metric: "Total Messages", value: data?.totalMessages ?? "" },
      { metric: "Total Leads", value: data?.totalLeads ?? "" },
      { metric: "Won Deals", value: data?.wonDeals ?? "" },
      { metric: "Conversion Rate %", value: data?.conversionRate ?? "" },
    ];
    downloadCsv(`analytics-${period}-${new Date().toISOString().slice(0, 10)}.csv`, kpiRows);
  }

  const kpis = [
    {
      label: "Total Conversations",
      value: int(data?.totalConversations ?? null),
      icon: MessageSquare,
      tint: "emerald" as const,
      delta: d?.totalConversations ?? null,
    },
    {
      label: "Open Conversations",
      value: int(data?.openConversations ?? null),
      icon: Inbox,
      tint: "sky" as const,
      delta: d?.openConversations ?? null,
    },
    {
      label: "Resolved Today",
      value: int(data?.resolvedToday ?? null),
      icon: CheckCircle2,
      tint: "violet" as const,
      delta: d?.resolvedToday ?? null,
    },
    {
      label: "Total Messages",
      value: int(data?.totalMessages ?? null),
      icon: Send,
      tint: "amber" as const,
      delta: d?.totalMessages ?? null,
    },
    {
      label: "Avg Response Time",
      value: mins(data?.avgResponseTimeMinutes ?? null),
      icon: Clock,
      tint: "rose" as const,
      delta: d?.avgResponseTimeMinutes ?? null,
      // A falling response time is a win — colour the delta the other way round.
      invertDelta: true,
    },
    {
      label: "Total Leads",
      value: int(data?.totalLeads ?? null),
      icon: Target,
      tint: "sky" as const,
      delta: d?.totalLeads ?? null,
    },
    {
      label: "Won Deals",
      value: int(data?.wonDeals ?? null),
      icon: Trophy,
      tint: "emerald" as const,
      delta: d?.wonDeals ?? null,
    },
    {
      label: "Conversion Rate",
      value: pct(data?.conversionRate ?? null),
      icon: Percent,
      tint: "violet" as const,
      delta: d?.conversionRate ?? null,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Analytics"
        description="Conversation volume, pipeline health and agent throughput across your workspace."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* One filter row above everything it scopes — never per-chart. */}
            <div
              role="group"
              aria-label="Date range"
              className="inline-flex rounded-lg bg-slate-100 p-0.5"
            >
              {PERIODS.map((p) => {
                const active = p.value === period;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPeriod(p.value)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
                      active
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-800",
                    )}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            <Button variant="secondary" onClick={handleExportCsv}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        }
      />

      {/* Refetching dims rather than collapsing to skeletons — no layout jump. */}
      <div
        className={cn(
          "space-y-6 transition-opacity",
          isFetching && !isLoading && "opacity-60",
        )}
      >
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {kpis.map((k) => (
            <KpiCard
              key={k.label}
              label={k.label}
              value={k.value}
              icon={k.icon}
              tint={k.tint}
              delta={k.delta}
              invertDelta={k.invertDelta}
              loading={isLoading}
            />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <MessagesOverTimeChart data={data?.messagesChart} loading={isLoading} />
          <LeadPipelineChart data={data?.leadsByStage} loading={isLoading} />
          <LeadScoreDonut data={data?.scoreDistribution} loading={isLoading} />
          <CampaignPerformanceChart data={data?.campaignPerformance} loading={isLoading} />
        </div>

        <AgentPerformanceTable data={data?.agentPerformance} loading={isLoading} />
      </div>
    </div>
  );
}
