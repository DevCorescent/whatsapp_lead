"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  MessageSquare,
  Users,
  Megaphone,
  UserCog,
  Target,
  Loader2,
} from "lucide-react";
import { Button, PageHeader } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { AnalyticsData } from "@/components/analytics/Charts";

// ─── Period ───────────────────────────────────────────────────────────────────

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "90d", label: "90 Days" },
] as const;
type Period = (typeof PERIODS)[number]["value"];

// ─── Role helpers ─────────────────────────────────────────────────────────────

const ADMIN_ROLES = ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN", "MANAGER", "MARKETING_USER"];
const MANAGER_ROLES = ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN", "MANAGER"];

// ─── Data ─────────────────────────────────────────────────────────────────────

function useAnalyticsSummary(period: Period) {
  return useQuery<AnalyticsData>({
    queryKey: ["analytics", period],
    queryFn: async () => {
      const res = await fetch(`/api/analytics?period=${period}`);
      if (!res.ok) throw new Error("Failed");
      const json: unknown = await res.json();
      if (json && typeof json === "object" && "data" in json) {
        return (json as { data: AnalyticsData }).data ?? {};
      }
      return json as AnalyticsData;
    },
    staleTime: 60_000,
  });
}

// ─── Download helper ──────────────────────────────────────────────────────────

async function triggerDownload(resource: string, period: Period): Promise<void> {
  const res = await fetch(`/api/export?resource=${resource}&period=${period}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Export failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${resource}-${period}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Report card ─────────────────────────────────────────────────────────────

interface ReportCardProps {
  resource: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  count?: number | null;
  period: Period;
}

function ReportCard({ resource, icon: Icon, title, description, count, period }: ReportCardProps) {
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  async function handleDownload() {
    setLoading(true);
    try {
      await triggerDownload(resource, period);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Export failed", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>

      {count != null && (
        <p className="text-2xl font-bold tabular-nums">{count.toLocaleString()}</p>
      )}

      <Button
        size="sm"
        variant="secondary"
        onClick={handleDownload}
        disabled={loading}
        className="self-start"
      >
        {loading ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="mr-1.5 h-3.5 w-3.5" />
        )}
        {loading ? "Downloading…" : "Download CSV"}
      </Button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role ?? "";
  const isAgent = role === "AGENT";

  const [period, setPeriod] = useState<Period>("30d");
  const { data: analytics } = useAnalyticsSummary(period);

  // Cards available to admin/manager/owner roles
  const workspaceCards = [
    {
      resource: "conversations",
      icon: MessageSquare,
      title: "Conversations",
      description: "All conversations — contact, status, assigned agent, timestamps",
      count: analytics?.totalConversations,
    },
    {
      resource: "contacts",
      icon: Users,
      title: "Contacts",
      description: "All contacts — name, phone, email, source, tags, created date",
      count: null,
    },
    {
      resource: "leads",
      icon: Target,
      title: "Leads",
      description: "All leads — stage, score, value, BANT fields, closed date",
      count: analytics?.totalLeads,
    },
    {
      resource: "campaigns",
      icon: Megaphone,
      title: "Campaigns",
      description: "All campaigns — delivery funnel: sent, delivered, read, failed",
      count: null,
    },
  ] as const;

  const managerCard = {
    resource: "agents",
    icon: UserCog,
    title: "Agent Performance",
    description: "Per-agent: conversations assigned, resolved count, resolution rate",
    count: analytics?.agentPerformance?.length ?? null,
  } as const;

  // Card only agents see
  const myConvCard = {
    resource: "my-conversations",
    icon: MessageSquare,
    title: "My Conversations",
    description: "Conversations assigned to you — contact, status, timestamps",
    count: null,
  } as const;

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Download workspace data as CSV, scoped to the selected period."
      />

      {/* Period filter */}
      <div className="mb-6 flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              period === p.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {isAgent ? (
          // Agents only see their own data
          <ReportCard {...myConvCard} period={period} />
        ) : (
          <>
            {workspaceCards.map((card) => (
              <ReportCard key={card.resource} {...card} period={period} />
            ))}
            {MANAGER_ROLES.includes(role) && (
              <ReportCard {...managerCard} period={period} />
            )}
          </>
        )}
      </div>

      {/* Tip */}
      <p className="mt-6 text-xs text-muted-foreground">
        All exports are scoped to your workspace. Maximum 10,000 rows per file.
      </p>
    </div>
  );
}
