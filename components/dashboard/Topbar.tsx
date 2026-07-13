"use client";

import { useState, useRef, useEffect } from "react";
import { Search, Bell, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type AgentStatus = "Online" | "Busy" | "Away";

const STATUS_DOT: Record<AgentStatus, string> = {
  Online: "bg-emerald-500",
  Busy: "bg-rose-500",
  Away: "bg-amber-500",
};

/**
 * Deliberately does NOT render the page title — every page already opens with a
 * PageHeader, and showing it twice made the top of each screen read as a stutter
 * ("Analytics" over "Analytics"). The bar is search plus presence, nothing else.
 */
export function Topbar({ tenantName }: { tenantName?: string | null }) {
  const [status, setStatus] = useState<AgentStatus>("Online");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200/70 bg-white/80 px-4 pl-16 backdrop-blur-sm lg:px-6 lg:pl-6">
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          placeholder="Search contacts, conversations, leads…"
          aria-label="Search"
          className="h-9 w-full rounded-lg bg-slate-50 pl-9 pr-3 text-sm text-slate-900 ring-1 ring-inset ring-transparent transition placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {tenantName && (
          <span className="mr-1 hidden text-sm text-slate-500 md:inline">{tenantName}</span>
        )}

        <button
          className="relative rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Notifications"
        >
          <Bell className="h-[18px] w-[18px]" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-rose-500 ring-2 ring-white" />
        </button>

        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
            className="flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50"
          >
            <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[status])} />
            <span className="hidden sm:inline">{status}</span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>

          {open && (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-1.5 w-36 overflow-hidden rounded-xl bg-white py-1 shadow-lg ring-1 ring-slate-900/5"
            >
              {(Object.keys(STATUS_DOT) as AgentStatus[]).map((s) => (
                <button
                  key={s}
                  role="menuitem"
                  onClick={() => {
                    setStatus(s);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
                >
                  <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[s])} />
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
