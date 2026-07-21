"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Search, Bell, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui";
import { useSearch } from "@/hooks/useSearch";

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

  // ─── Global search ──────────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Debounce the query (300ms) so we only hit the API once the user pauses.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isLoading } = useSearch(debounced);
  const showResults = searchFocused && debounced.trim().length >= 2;

  const groups = data ?? {
    contacts: [],
    leads: [],
    conversations: [],
    messages: [],
    campaigns: [],
  };
  const hasResults =
    groups.contacts.length > 0 ||
    groups.leads.length > 0 ||
    groups.conversations.length > 0 ||
    groups.messages.length > 0 ||
    groups.campaigns.length > 0;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  useEffect(() => {
    if (!showResults) return;
    const onClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchFocused(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showResults]);

  const closeSearch = () => setSearchFocused(false);

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200/70 bg-white/80 px-4 pl-16 backdrop-blur-sm lg:px-6 lg:pl-6">
      <div className="relative w-full max-w-sm" ref={searchRef}>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          placeholder="Search contacts, conversations, leads…"
          aria-label="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setSearchFocused(false);
          }}
          className="h-9 w-full rounded-lg bg-slate-50 pl-9 pr-3 text-sm text-slate-900 ring-1 ring-inset ring-transparent transition placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />

        {showResults && (
          <div className="absolute left-0 right-0 z-30 mt-1.5 max-h-[70vh] overflow-y-auto rounded-xl bg-white py-1 shadow-lg ring-1 ring-slate-900/5">
            {isLoading ? (
              <p className="px-3 py-2 text-sm text-slate-500">Searching…</p>
            ) : !hasResults ? (
              <p className="px-3 py-2 text-sm text-slate-500">No results for “{debounced}”</p>
            ) : (
              <>
                {groups.contacts.length > 0 && (
                  <div className="py-1">
                    <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Contacts
                    </p>
                    {groups.contacts.map((c) => (
                      <Link
                        key={c.id}
                        href={`/contacts/${c.id}`}
                        onClick={closeSearch}
                        className="flex items-center gap-2.5 px-3 py-1.5 transition hover:bg-slate-50"
                      >
                        <Avatar name={c.name} size="xs" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-slate-700">{c.name}</span>
                          {c.phone && (
                            <span className="block truncate text-xs text-slate-400">{c.phone}</span>
                          )}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}

                {groups.leads.length > 0 && (
                  <div className="py-1">
                    <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Leads
                    </p>
                    {groups.leads.map((l) => (
                      <Link
                        key={l.id}
                        href="/leads"
                        onClick={closeSearch}
                        className="flex items-center gap-2.5 px-3 py-1.5 transition hover:bg-slate-50"
                      >
                        <Avatar name={l.contact?.name ?? l.title} size="xs" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-slate-700">{l.title}</span>
                          {l.contact?.name && (
                            <span className="block truncate text-xs text-slate-400">
                              {l.contact.name}
                            </span>
                          )}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}

                {groups.conversations.length > 0 && (
                  <div className="py-1">
                    <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Conversations
                    </p>
                    {groups.conversations.map((conv) => (
                      <Link
                        key={conv.id}
                        href="/inbox"
                        onClick={closeSearch}
                        className="flex items-center gap-2.5 px-3 py-1.5 transition hover:bg-slate-50"
                      >
                        <Avatar name={conv.contact?.name} size="xs" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-slate-700">
                            {conv.contact?.name ?? conv.contact?.phone}
                          </span>
                          {conv.lastMessagePreview && (
                            <span className="block truncate text-xs text-slate-400">
                              {conv.lastMessagePreview}
                            </span>
                          )}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}

                {groups.messages.length > 0 && (
                  <div className="py-1">
                    <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Messages
                    </p>
                    {groups.messages.map((m) => (
                      <Link
                        key={m.id}
                        href="/inbox"
                        onClick={closeSearch}
                        className="block px-3 py-1.5 transition hover:bg-slate-50"
                      >
                        <span className="block truncate text-sm text-slate-700">{m.content}</span>
                      </Link>
                    ))}
                  </div>
                )}

                {groups.campaigns.length > 0 && (
                  <div className="py-1">
                    <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Campaigns
                    </p>
                    {groups.campaigns.map((camp) => (
                      <Link
                        key={camp.id}
                        href="/campaigns"
                        onClick={closeSearch}
                        className="block px-3 py-1.5 transition hover:bg-slate-50"
                      >
                        <span className="block truncate text-sm text-slate-700">{camp.name}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
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
