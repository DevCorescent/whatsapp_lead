"use client";

// ============================================================================
// COMPONENT : RecipientReview
//
// The last look at who a campaign or broadcast will reach: search by number or
// name, remove one recipient or a selection, restore removed ones, and see the
// final count. Removing someone here only leaves them out of this send — the
// contact itself is never touched. Used by Bulk Broadcast and Create Campaign.
// ============================================================================

import { useState } from "react";
import { RotateCcw, Search, UserMinus, X } from "lucide-react";
import { Button, inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface ReviewItem {
  /** Stable identity: the normalised phone for pasted numbers, the contact id otherwise. */
  key: string;
  phone: string;
  name?: string | null;
}

const PAGE_SIZE = 50;

/** What POST /api/campaigns reports about recipients it left out. */
export interface ExclusionReport {
  excludedCount: number;
  excludedByReason: { blacklisted: number; opted_out: number; deleted: number };
  excluded: { phone: string; name: string | null; reason: "blacklisted" | "opted_out" | "deleted" }[];
}

const REASON_LABEL: Record<ExclusionReport["excluded"][number]["reason"], string> = {
  blacklisted: "Blacklisted",
  opted_out: "Opted out",
  deleted: "Deleted contact",
};

/**
 * Recipients the server removed before sending, and why. Always visible when there
 * are any — a blacklisted number silently vanishing from the count would read as a bug.
 */
export function ExcludedSummary({ report }: { report: ExclusionReport }) {
  if (report.excludedCount === 0) return null;
  const { blacklisted, opted_out, deleted } = report.excludedByReason;
  const parts = [
    blacklisted && `${blacklisted} blacklisted`,
    opted_out && `${opted_out} opted out`,
    deleted && `${deleted} deleted`,
  ].filter(Boolean);
  return (
    <details className="rounded-lg bg-amber-50 px-3 py-2 text-xs ring-1 ring-inset ring-amber-200">
      <summary className="cursor-pointer font-medium text-amber-800">
        {report.excludedCount.toLocaleString()} won&apos;t receive this — {parts.join(", ")}
      </summary>
      <ul className="scrollbar-slim mt-2 max-h-40 space-y-1 overflow-y-auto">
        {report.excluded.map((e, i) => (
          <li key={i} className="flex justify-between gap-3">
            <span className="truncate">
              <span className="font-mono text-slate-700">+{e.phone}</span>
              {e.name && <span className="text-slate-500"> · {e.name}</span>}
            </span>
            <span className="shrink-0 text-amber-800">{REASON_LABEL[e.reason]}</span>
          </li>
        ))}
        {report.excludedCount > report.excluded.length && (
          <li className="text-slate-500">…and {(report.excludedCount - report.excluded.length).toLocaleString()} more</li>
        )}
      </ul>
    </details>
  );
}

export function RecipientReview({
  items,
  removed,
  onRemovedChange,
  className,
}: {
  items: ReviewItem[];
  removed: Set<string>;
  onRemovedChange: (next: Set<string>) => void;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [showRemoved, setShowRemoved] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);

  const q = query.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, "");
  const inView = items.filter((it) => removed.has(it.key) === showRemoved);
  const filtered = q
    ? inView.filter((it) => (qDigits && it.phone.includes(qDigits)) || (it.name ?? "").toLowerCase().includes(q))
    : inView;
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  // Selection only ever covers what the current view shows.
  const selectedHere = filtered.filter((it) => selected.has(it.key));
  const allFilteredSelected = filtered.length > 0 && selectedHere.length === filtered.length;
  const finalCount = items.length - items.filter((it) => removed.has(it.key)).length;
  const removedCount = items.length - finalCount;

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function apply(keys: string[], remove: boolean) {
    const next = new Set(removed);
    for (const k of keys) {
      if (remove) next.add(k);
      else next.delete(k);
    }
    onRemovedChange(next);
    setSelected(new Set());
  }

  function switchView(toRemoved: boolean) {
    setShowRemoved(toRemoved);
    setSelected(new Set());
    setPage(0);
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-700">
          Final recipients: <span className="font-semibold tabular-nums text-slate-900">{finalCount.toLocaleString()}</span>
          {removedCount > 0 && <span className="text-slate-500"> · {removedCount.toLocaleString()} removed</span>}
        </p>
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs">
          {[false, true].map((r) => (
            <button
              key={String(r)}
              type="button"
              onClick={() => switchView(r)}
              className={cn(
                "rounded-md px-2.5 py-1 font-medium transition",
                showRemoved === r ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
              )}
            >
              {r ? `Removed (${removedCount})` : `Sending (${finalCount})`}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(0); }}
            className={cn(inputClass, "pl-8")}
            placeholder="Search number or name"
            aria-label="Search recipients"
          />
        </div>
        {selectedHere.length > 0 && (
          <Button
            type="button"
            variant={showRemoved ? "secondary" : "danger"}
            size="sm"
            onClick={() => apply(selectedHere.map((it) => it.key), !showRemoved)}
          >
            {showRemoved ? <RotateCcw className="h-3.5 w-3.5" /> : <UserMinus className="h-3.5 w-3.5" />}
            {showRemoved ? "Restore" : "Remove"} {selectedHere.length.toLocaleString()} selected
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg ring-1 ring-inset ring-slate-200">
        <label className="flex cursor-pointer items-center gap-2.5 border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            checked={allFilteredSelected}
            disabled={filtered.length === 0}
            onChange={() =>
              setSelected(allFilteredSelected ? new Set() : new Set(filtered.map((it) => it.key)))
            }
            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          Select all{q ? " matching" : ""} ({filtered.length.toLocaleString()})
        </label>
        {visible.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-slate-500">
            {showRemoved ? "No one removed." : q ? "No recipients match." : "No recipients."}
          </p>
        ) : (
          <ul className="scrollbar-slim max-h-72 divide-y divide-slate-100 overflow-y-auto">
            {visible.map((it) => (
              <li key={it.key} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={selected.has(it.key)}
                  onChange={() => toggle(it.key)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  aria-label={`Select +${it.phone}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[13px] text-slate-800">+{it.phone}</span>
                  {it.name && <span className="block truncate text-xs text-slate-500">{it.name}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => apply([it.key], !showRemoved)}
                  className="rounded-md p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 sm:p-1"
                  aria-label={showRemoved ? `Restore +${it.phone}` : `Remove +${it.phone}`}
                  title={showRemoved ? "Restore" : "Remove from this send"}
                >
                  {showRemoved ? <RotateCcw className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                </button>
              </li>
            ))}
          </ul>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-3 py-1.5 text-xs text-slate-500">
            <span>Page {current + 1} of {pages}</span>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</Button>
              <Button type="button" variant="ghost" size="sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
      <p className="text-[11px] text-slate-400">
        Removing someone only leaves them out of this send — their contact isn&apos;t deleted.
      </p>
    </div>
  );
}
