"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Search, Bell, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const TITLES: Record<string, string> = {
  "/inbox": "Inbox",
  "/contacts": "Contacts",
  "/leads": "Lead Pipeline",
  "/campaigns": "Campaigns",
  "/chatbot": "Chatbot",
  "/tickets": "Tickets",
  "/analytics": "Analytics",
  "/knowledge-base": "Knowledge Base",
  "/ai-settings": "AI Settings",
  "/team": "Team",
  "/settings": "Settings",
};

type AgentStatus = "Online" | "Busy" | "Away";

const STATUS_DOT: Record<AgentStatus, string> = {
  Online: "bg-emerald-500",
  Busy: "bg-rose-500",
  Away: "bg-amber-500",
};

export function Topbar({ tenantName }: { tenantName?: string | null }) {
  const pathname = usePathname();
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

  // Longest matching prefix, so /contacts/[id] still reads "Contacts".
  const title =
    Object.entries(TITLES)
      .filter(([href]) => pathname === href || pathname.startsWith(`${href}/`))
      .sort((a, b) => b[0].length - a[0].length)[0]?.[1] ?? "Dashboard";

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4 pl-16 lg:px-6 lg:pl-6">
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold text-slate-900">{title}</h1>
        {tenantName && <p className="truncate text-xs text-slate-500">{tenantName}</p>}
      </div>

      <div className="relative mx-auto hidden w-full max-w-md md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          placeholder="Search contacts, conversations, leads…"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          className="relative rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
        </button>

        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
          >
            <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[status])} />
            <span className="hidden sm:inline">{status}</span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>

          {open && (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-1 w-36 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
            >
              {(Object.keys(STATUS_DOT) as AgentStatus[]).map((s) => (
                <button
                  key={s}
                  role="menuitem"
                  onClick={() => {
                    setStatus(s);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
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
