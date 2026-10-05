"use client";

// Small helpers shared by the reseller panel pages.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** fetch → JSON, throwing the API's error message on failure. */
export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.json !== undefined ? { "Content-Type": "application/json" } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

/** Minor units (paise) → "₹1,234.50". */
export function money(minor: number | null | undefined, currency = "inr") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 2,
  }).format((minor ?? 0) / 100);
}

/** Rupees (major units, as plans store prices) → "₹999". */
export function rupees(amount: number | null | undefined) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount ?? 0);
}

export function Tile({
  label,
  value,
  hint,
  tone = "slate",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "slate" | "emerald" | "amber" | "sky";
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-2xl p-3 ring-1 ring-inset sm:p-4",
        tone === "emerald" && "bg-emerald-50 ring-emerald-100",
        tone === "amber" && "bg-amber-50 ring-amber-100",
        tone === "sky" && "bg-sky-50 ring-sky-100",
        tone === "slate" && "bg-white ring-slate-900/5 shadow-sm",
      )}
    >
      <p className="break-words text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words text-lg font-semibold tabular-nums text-slate-900 sm:text-2xl">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export const STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  TRIALING: "bg-sky-50 text-sky-700 ring-sky-600/20",
  PAST_DUE: "bg-amber-50 text-amber-800 ring-amber-600/20",
  CANCELLED: "bg-slate-100 text-slate-500 ring-slate-400/20",
  EXPIRED: "bg-slate-100 text-slate-500 ring-slate-400/20",
  PENDING: "bg-amber-50 text-amber-800 ring-amber-600/20",
  PAID: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  SUSPENDED: "bg-rose-50 text-rose-700 ring-rose-600/20",
};
