"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Bell, ChevronDown, Search } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { Avatar } from "@/components/ui";

type AgentStatus = "Online" | "Busy" | "Away";

const STATUS_DOT: Record<AgentStatus, string> = {
  Online: "bg-emerald-500",
  Busy: "bg-rose-500",
  Away: "bg-amber-500",
};

type Notification = {
  id: string;
  type: "message" | "activity";
  title: string;
  body: string;
  avatar: string | null;
  createdAt: string;
  href: string;
};

function useNotifications() {
  return useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const r = await fetch("/api/notifications");
      const j = await r.json();
      return j.data ?? [];
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const { data: notifications = [] } = useNotifications();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const unread = Math.min(notifications.length, 9);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen((v) => !v); qc.invalidateQueries({ queryKey: ["notifications"] }); }}
        className="relative rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
        aria-label="Notifications"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white ring-2 ring-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-900/5">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="text-sm font-semibold text-slate-900">Notifications</span>
            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-600">
              {unread} new
            </span>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No notifications yet</p>
            ) : (
              notifications.slice(0, 12).map((n) => (
                <Link
                  key={n.id}
                  href={n.href}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-3 px-4 py-3 transition hover:bg-slate-50"
                >
                  <Avatar name={n.title} src={n.avatar} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{n.title}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{n.body}</p>
                    <p className="mt-1 text-[10px] text-slate-400">{timeAgo(new Date(n.createdAt))}</p>
                  </div>
                </Link>
              ))
            )}
          </div>

          <div className="border-t border-slate-100 px-4 py-2.5">
            <Link
              href="/analytics"
              onClick={() => setOpen(false)}
              className="block text-center text-xs font-medium text-emerald-600 hover:underline"
            >
              View all activity
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export function Topbar({ tenantName }: { tenantName?: string | null }) {
  const [status, setStatus] = useState<AgentStatus>("Online");
  const [statusOpen, setStatusOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<{ contacts: {id:string;name:string;phone:string}[]; leads: {id:string;title:string;stage:string}[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close status dropdown on outside click
  useEffect(() => {
    if (!statusOpen) return;
    const handler = (e: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [statusOpen]);

  // Close search results on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchResults(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Debounced search
  useEffect(() => {
    if (search.trim().length < 2) { setSearchResults(null); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(search.trim())}`);
        const j = await r.json();
        setSearchResults(j.data ?? null);
      } catch {}
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200/70 bg-white/80 px-4 pl-16 backdrop-blur-sm lg:px-6 lg:pl-6">
      {/* Global search */}
      <div className="relative w-full max-w-sm" ref={searchRef}>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search contacts, conversations, leads…"
          aria-label="Search"
          className="h-9 w-full rounded-lg bg-slate-50 pl-9 pr-3 text-sm text-slate-900 ring-1 ring-inset ring-transparent transition placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />

        {(searchResults || searching) && (
          <div className="absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-900/5">
            {searching && <p className="px-4 py-3 text-sm text-slate-400">Searching…</p>}
            {searchResults && !searching && (
              <>
                {searchResults.contacts.length === 0 && searchResults.leads.length === 0 && (
                  <p className="px-4 py-3 text-sm text-slate-400">No results for &ldquo;{search}&rdquo;</p>
                )}
                {searchResults.contacts.length > 0 && (
                  <div>
                    <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Contacts</p>
                    {searchResults.contacts.map((c) => (
                      <Link key={c.id} href={`/contacts/${c.id}`} onClick={() => { setSearch(""); setSearchResults(null); }}
                        className="flex items-center gap-2.5 px-4 py-2 hover:bg-slate-50">
                        <Avatar name={c.name} size="xs" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-900">{c.name}</span>
                          <span className="block text-xs text-slate-500">{c.phone}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
                {searchResults.leads.length > 0 && (
                  <div>
                    <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Leads</p>
                    {searchResults.leads.map((l) => (
                      <Link key={l.id} href="/leads" onClick={() => { setSearch(""); setSearchResults(null); }}
                        className="flex items-center gap-2.5 px-4 py-2 hover:bg-slate-50">
                        <span className="block truncate text-sm font-medium text-slate-900">{l.title}</span>
                        <span className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-600">{l.stage.replace(/_/g, " ")}</span>
                      </Link>
                    ))}
                  </div>
                )}
                <div className="h-2" />
              </>
            )}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {tenantName && (
          <span className="mr-1 hidden text-sm text-slate-500 md:inline">{tenantName}</span>
        )}

        <NotificationBell />

        <div className="relative" ref={statusRef}>
          <button
            onClick={() => setStatusOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={statusOpen}
            className="flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50"
          >
            <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[status])} />
            <span className="hidden sm:inline">{status}</span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>

          {statusOpen && (
            <div role="menu" className="absolute right-0 z-20 mt-1.5 w-36 overflow-hidden rounded-xl bg-white py-1 shadow-lg ring-1 ring-slate-900/5">
              {(Object.keys(STATUS_DOT) as AgentStatus[]).map((s) => (
                <button key={s} role="menuitem" onClick={() => { setStatus(s); setStatusOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50">
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
