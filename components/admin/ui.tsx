"use client";

/**
 * Light-themed primitives for the super-admin panel.
 *
 * White cards, hairline slate borders, ink text — matches the rest of the app.
 * Category tones (violet/emerald/sky/amber/rose/slate) are kept as-is for data
 * categorisation (KPI icons, plan badges) but rendered as soft light chips
 * instead of dark glow chips. `Avatar` + `Modal` + `Field` + `inputClass` from
 * the shared `@/components/ui` kit are still reused directly.
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
    <div className={cn("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>
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
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-slate-900">{title}</h2>
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
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
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
    primary: "bg-[#0B6E4F] text-white hover:bg-[#095c42]",
    secondary:
      "bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:text-slate-900",
    ghost: "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
  };
  const sizes: Record<string, string> = {
    sm: "px-2.5 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B6E4F]",
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
  violet: "bg-violet-50 text-violet-700 ring-violet-100",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  rose: "bg-rose-50 text-rose-700 ring-rose-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  sky: "bg-sky-50 text-sky-700 ring-sky-100",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
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
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 " +
  "placeholder:text-slate-400 focus:border-[#0B6E4F] focus:outline-none focus:ring-2 focus:ring-emerald-100";

export const adminSelectClass = cn(adminInputClass, "appearance-none pr-8");

// ─── Loading + empty ──────────────────────────────────────────────────────────

export function AdminSkeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-slate-100", className)} />;
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
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
          <Icon className="h-6 w-6 text-slate-400" />
        </span>
      )}
      <p className="text-sm font-medium text-slate-700">{title}</p>
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
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <p className="text-xs leading-relaxed text-amber-800">
        <span className="font-semibold">Preview data.</span> <code className="text-amber-900">{endpoint}</code>{" "}
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
      ? "text-emerald-600"
      : deltaDirection === "down"
        ? "text-rose-600"
        : "text-slate-400";

  return (
    <AdminCard className="p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
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
        <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
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
  const bar = pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-[#0B6E4F]";
  return (
    <div className="w-28 min-w-24">
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="text-slate-700">{used.toLocaleString("en-IN")}</span>
        <span className="text-slate-500">{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
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
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition",
            value === o.value
              ? "bg-[#0B6E4F] text-white"
              : "text-slate-500 hover:bg-white hover:text-slate-900",
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
  "whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500";
export const tdClass = "whitespace-nowrap px-4 py-3 text-sm text-slate-700";

// ─── Recharts theming (light) ─────────────────────────────────────────────────

export const CHART = {
  violet: "#7c3aed",
  emerald: "#059669",
  sky: "#0284c7",
  amber: "#d97706",
  rose: "#e11d48",
  grid: "#e2e8f0",
  tick: "#64748b",
} as const;

export const axisProps = {
  stroke: CHART.grid,
  tick: { fill: CHART.tick, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: CHART.grid },
} as const;

export const tooltipStyle = {
  contentStyle: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    fontSize: 12,
    color: "#0f172a",
    boxShadow: "0 8px 24px rgba(15,23,42,.08)",
  },
  labelStyle: { color: "#64748b", marginBottom: 4 },
  itemStyle: { color: "#0f172a" },
  cursor: { fill: "rgba(15,23,42,.04)", stroke: CHART.grid },
} as const;