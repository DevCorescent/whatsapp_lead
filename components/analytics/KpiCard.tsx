"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { Card, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Icon-chip tints. Tailwind v4 scans source for literal class names, so these
 * must stay as complete strings — never build them by interpolation.
 */
const TINTS = {
  emerald: "bg-emerald-50 text-emerald-600",
  sky: "bg-sky-50 text-sky-600",
  violet: "bg-violet-50 text-violet-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
  slate: "bg-slate-100 text-slate-600",
} as const;

export type KpiTint = keyof typeof TINTS;

export interface KpiCardProps {
  label: string;
  /** Pre-formatted value. `null` renders the em-dash placeholder. */
  value: string | null;
  icon: React.ComponentType<{ className?: string }>;
  tint?: KpiTint;
  /** Percentage change vs the previous period. `null`/`undefined` → muted row. */
  delta?: number | null;
  /** For metrics where down is good (e.g. response time), flip the colouring. */
  invertDelta?: boolean;
  loading?: boolean;
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  tint = "slate",
  delta,
  invertDelta = false,
  loading = false,
}: KpiCardProps) {
  if (loading) {
    return (
      <Card className="p-4">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <Skeleton className="mt-3 h-3 w-24" />
        <Skeleton className="mt-2.5 h-7 w-16" />
        <Skeleton className="mt-3 h-3 w-28" />
      </Card>
    );
  }

  const hasDelta = delta != null && Number.isFinite(delta);
  const positive = hasDelta && delta > 0;
  const negative = hasDelta && delta < 0;
  // "Good" is green: normally an increase, but a falling response time is a win.
  const good = invertDelta ? negative : positive;
  const bad = invertDelta ? positive : negative;

  const TrendIcon = positive ? TrendingUp : TrendingDown;

  return (
    <Card className="p-4 transition hover:shadow-md">
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg",
          TINTS[tint],
        )}
      >
        <Icon className="h-4 w-4" />
      </span>

      <p className="mt-3 truncate text-xs font-medium text-slate-500">{label}</p>

      <p
        className={cn(
          "mt-1 text-2xl font-semibold tracking-tight",
          value == null ? "text-slate-300" : "text-slate-900",
        )}
      >
        {value ?? "—"}
      </p>

      <div className="mt-2 flex items-center gap-1 text-xs">
        {hasDelta ? (
          <>
            <TrendIcon
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                good && "text-emerald-600",
                bad && "text-rose-600",
                !good && !bad && "text-slate-400",
              )}
            />
            <span
              className={cn(
                "font-medium",
                good && "text-emerald-600",
                bad && "text-rose-600",
                !good && !bad && "text-slate-400",
              )}
            >
              {delta > 0 ? "+" : ""}
              {delta.toFixed(0)}%
            </span>
            <span className="text-slate-400">vs prev</span>
          </>
        ) : (
          <span className="text-slate-400">— vs prev</span>
        )}
      </div>
    </Card>
  );
}
