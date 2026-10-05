"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, RefreshCw, Wifi } from "lucide-react";
import { WhatsAppConnectCard } from "@/components/settings/WhatsAppConnectCard";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/utils";

interface HealthData {
  phoneNumber: string;
  verifiedName: string;
  qualityRating: string;
  messagingLimitTier: string;
  accountMode: string;
  isOfficialBusiness: boolean;
  nameStatus: string;
  codeVerificationStatus: string;
  lastOnboarded: string | null;
  profile: { about?: string; description?: string; email?: string; vertical?: string } | null;
}

const QUALITY_COLORS: Record<string, string> = {
  GREEN:   "text-emerald-700 bg-emerald-50 border-emerald-200",
  YELLOW:  "text-amber-700 bg-amber-50 border-amber-200",
  RED:     "text-rose-700 bg-rose-50 border-rose-200",
  UNKNOWN: "text-slate-500 bg-slate-50 border-slate-200",
};

const TIER_LABELS: Record<string, string> = {
  TIER_1K:        "1,000 msgs / 24 h",
  TIER_10K:       "10,000 msgs / 24 h",
  TIER_100K:      "100,000 msgs / 24 h",
  TIER_UNLIMITED: "Unlimited",
};

function HealthPanel() {
  const { data, isLoading, error, refetch, isFetching } = useQuery<{ success: boolean; data?: HealthData; error?: string }>({
    queryKey: ["whatsapp-health"],
    queryFn: async () => {
      const res = await fetch("/api/settings/whatsapp-health");
      return res.json();
    },
    retry: false,
    staleTime: 60_000,
  });

  const health = data?.success ? data.data : null;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Wifi className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700">Account Health</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}
          className="h-7 gap-1 text-xs text-slate-500">
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {isLoading && <p className="text-xs text-slate-400">Loading health data…</p>}

      {!isLoading && (error || !health) && (
        <p className="text-xs text-slate-400">
          {data?.error ?? "No WhatsApp number connected yet."}
        </p>
      )}

      {health && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Verified Name"   value={health.verifiedName ?? "—"} />
            <Stat label="Phone"           value={health.phoneNumber ?? "—"} />
            <Stat label="Account Mode"    value={health.accountMode ?? "—"} />
            <Stat label="Sending Tier"    value={TIER_LABELS[health.messagingLimitTier] ?? health.messagingLimitTier ?? "—"} />
            <Stat label="Business"        value={health.isOfficialBusiness ? "Official" : "Standard"} />
            <Stat label="Name Status"     value={health.nameStatus ?? "—"} />
          </div>

          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-slate-500">Quality:</span>
            <span className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
              QUALITY_COLORS[health.qualityRating] ?? QUALITY_COLORS.UNKNOWN,
            )}>
              {health.qualityRating === "GREEN" ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              {health.qualityRating ?? "UNKNOWN"}
            </span>
          </div>

          {health.profile?.about && (
            <p className="text-xs text-slate-500 border-t pt-2 mt-2">{health.profile.about}</p>
          )}
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-xs font-semibold text-slate-700 truncate">{value}</p>
    </div>
  );
}

export function WhatsAppTab() {
  return (
    <div className="space-y-5">
      <WhatsAppConnectCard />
      <HealthPanel />
    </div>
  );
}
