"use client";

/**
 * Dark-themed primitives for the super-admin panel.
 *
 * The shared `@/components/ui` kit is light-themed (white cards, emerald accent),
 * so the admin console gets its own small set: slate-950 page / slate-900 panels /
 * slate-800 borders with a violet accent. `Avatar` + `Modal` + `Field` + `inputClass`
 * from the shared kit are still reused (the modal surface is white, so light form
 * controls are correct inside it).
 */

import type { ComponentType, ReactNode } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Card ─────────────────────────────────────────────────────────────────────

export function AdminCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-slate-800 bg-slate-900 shadow-sm", className)}>
      {children}
    </div>
  );
}

/** Card with a title bar — used for every chart / table / panel block. */
export function AdminPanel({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <AdminCard className={cn("flex flex-col", className)}>
      <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-slate-100">{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className={cn("flex-1 p-4 sm:p-5", bodyClassName)}>{children}</div>
    </AdminCard>
  );
}

// ─── Page header ──────────────────────────────────────────────────────────────

export function AdminPageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-100 sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────

type AdminButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export function AdminButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: AdminButtonProps) {
  const variants: Record<string, string> = {
    primary: "bg-violet-600 text-white hover:bg-violet-500 shadow-sm shadow-violet-950/40",
    secondary:
      "bg-slate-800 text-slate-200 ring-1 ring-inset ring-slate-700 hover:bg-slate-700 hover:text-white",
    ghost: "text-slate-400 hover:bg-slate-800 hover:text-slate-100",
    danger: "bg-rose-600 text-white hover:bg-rose-500",
  };
  const sizes: Record<string, string> = {
    sm: "px-2.5 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────

export type AdminTone = "violet" | "emerald" | "rose" | "amber" | "sky" | "slate";

const TONE: Record<AdminTone, string> = {
  violet: "bg-violet-500/10 text-violet-300 ring-violet-500/30",
  emerald: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  rose: "bg-rose-500/10 text-rose-300 ring-rose-500/30",
  amber: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  sky: "bg-sky-500/10 text-sky-300 ring-sky-500/30",
  slate: "bg-slate-500/10 text-slate-300 ring-slate-500/30",
};

export function AdminBadge({
  children,
  tone = "slate",
  className,
}: {
  children: ReactNode;
  tone?: AdminTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Plan name → chip tone. Starter = slate, Growth = violet, Enterprise = amber. */
export function planTone(plan?: string | null): AdminTone {
  const p = (plan ?? "").toUpperCase();
  if (p.includes("ENTERPRISE")) return "amber";
  if (p.includes("GROWTH")) return "violet";
  if (p.includes("STARTER")) return "slate";
  return "sky";
}

// ─── Form controls ────────────────────────────────────────────────────────────

export const adminInputClass =
  "w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 " +
  "placeholder:text-slate-500 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20";

export const adminSelectClass = cn(adminInputClass, "appearance-none pr-8");

// ─── Loading + empty ──────────────────────────────────────────────────────────

export function AdminSkeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-slate-800", className)} />;
}

export function AdminSkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <AdminSkeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}

export function AdminEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {Icon && (
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-800">
          <Icon className="h-6 w-6 text-slate-500" />
        </span>
      )}
      <p className="text-sm font-medium text-slate-200">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * TODO [SHALMON]: remove once /api/admin/* stops returning 501.
 * Shown whenever a query fails so the console never renders a fake number
 * without telling the operator that it is preview data.
 */
export function PreviewBanner({ endpoint }: { endpoint: string }) {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <p className="text-xs leading-relaxed text-amber-200/90">
        <span className="font-semibold">Preview data.</span> <code className="text-amber-100">{endpoint}</code>{" "}
        is not implemented yet (HTTP 501) — the figures below are placeholders and will switch to live
        values automatically once the endpoint ships.
      </p>
    </div>
  );
}

// ─── KPI tile ─────────────────────────────────────────────────────────────────

export function StatTile({
  label,
  value,
  icon: Icon,
  tone = "violet",
  delta,
  deltaDirection = "flat",
  deltaNote,
  loading,
}: {
  label: string;
  value: ReactNode;
  icon: ComponentType<{ className?: string }>;
  tone?: AdminTone;
  delta?: string;
  deltaDirection?: "up" | "down" | "flat";
  deltaNote?: string;
  loading?: boolean;
}) {
  const DeltaIcon =
    deltaDirection === "up" ? ArrowUpRight : deltaDirection === "down" ? ArrowDownRight : Minus;
  const deltaColor =
    deltaDirection === "up"
      ? "text-emerald-400"
      : deltaDirection === "down"
        ? "text-rose-400"
        : "text-slate-400";

  return (
    <AdminCard className="p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
            TONE[tone],
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>

      {loading ? (
        <AdminSkeleton className="mt-3 h-7 w-24" />
      ) : (
        <p className="mt-2 text-2xl font-bold tracking-tight text-slate-100">{value}</p>
      )}

      <div className="mt-2 flex items-center gap-1 text-xs">
        {loading ? (
          <AdminSkeleton className="h-3 w-28" />
        ) : (
          <>
            {delta && (
              <span className={cn("inline-flex items-center gap-0.5 font-medium", deltaColor)}>
                <DeltaIcon className="h-3.5 w-3.5" />
                {delta}
              </span>
            )}
            {deltaNote && <span className="truncate text-slate-500">{deltaNote}</span>}
          </>
        )}
      </div>
    </AdminCard>
  );
}

// ─── Usage bar ────────────────────────────────────────────────────────────────

export function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const bar = pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-violet-500";
  return (
    <div className="w-28 min-w-24">
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="text-slate-200">{used.toLocaleString("en-IN")}</span>
        <span className="text-slate-500">{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div className={cn("h-full rounded-full transition-all", bar)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Segmented control ────────────────────────────────────────────────────────

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-slate-800 bg-slate-900 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition",
            value === o.value
              ? "bg-violet-600 text-white"
              : "text-slate-400 hover:bg-slate-800 hover:text-slate-200",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Table shell ──────────────────────────────────────────────────────────────

export function AdminTable({ children }: { children: ReactNode }) {
  return (
    <div className="scrollbar-slim overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">{children}</table>
    </div>
  );
}

export const thClass =
  "whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400";
export const tdClass = "whitespace-nowrap px-4 py-3 text-sm text-slate-300";

// ─── Recharts theming (dark) ──────────────────────────────────────────────────

export const CHART = {
  violet: "#8b5cf6",
  emerald: "#10b981",
  sky: "#38bdf8",
  amber: "#f59e0b",
  rose: "#f43f5e",
  grid: "#334155",
  tick: "#94a3b8",
} as const;

export const axisProps = {
  stroke: CHART.grid,
  tick: { fill: CHART.tick, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: CHART.grid },
} as const;

export const tooltipStyle = {
  contentStyle: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 10,
    fontSize: 12,
    color: "#e2e8f0",
    boxShadow: "0 8px 24px rgba(0,0,0,.45)",
  },
  labelStyle: { color: "#94a3b8", marginBottom: 4 },
  itemStyle: { color: "#e2e8f0" },
  cursor: { fill: "rgba(148,163,184,.08)", stroke: CHART.grid },
} as const;
