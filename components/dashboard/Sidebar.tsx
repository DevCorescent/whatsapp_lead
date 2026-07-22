"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  MessageSquare,
  Users,
  Target,
  Megaphone,
  FileText,
  Bot,
  Ticket,
  BarChart2,
  CreditCard,
  BookOpen,
  Sparkles,
  UserCog,
  Settings,
  Building2,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui";
import { BusinessSwitcher } from "@/components/dashboard/BusinessSwitcher";
import type { BusinessesResponse } from "@/hooks/useBusinesses";

/** Grouped so eleven links don't read as one undifferentiated wall. */
const NAV = [
  {
    section: null,
    items: [
      { href: "/inbox", label: "Inbox", icon: MessageSquare },
      { href: "/contacts", label: "Contacts", icon: Users },
      { href: "/leads", label: "Leads", icon: Target },
    ],
  },
   {
     section: "Automate",
     items: [
       { href: "/campaigns", label: "Campaigns", icon: Megaphone },
       { href: "/templates", label: "Templates", icon: FileText },
       { href: "/chatbot", label: "Chatbot", icon: Bot },
       { href: "/ai-settings", label: "AI Settings", icon: Sparkles },
       { href: "/knowledge-base", label: "Knowledge Base", icon: BookOpen },
     ],
   },
   {
     section: "Manage",
     items: [
       { href: "/tickets", label: "Tickets", icon: Ticket },
       { href: "/analytics", label: "Analytics", icon: BarChart2 },
       { href: "/businesses", label: "Businesses", icon: Building2 },
       { href: "/team", label: "Team", icon: UserCog },
       { href: "/billing", label: "Billing", icon: CreditCard },
       { href: "/settings", label: "Settings", icon: Settings },
     ],
   },
];

const PLAN_STYLE: Record<string, string> = {
  STARTER: "bg-slate-100 text-slate-600",
  GROWTH: "bg-emerald-100 text-emerald-700",
  ENTERPRISE: "bg-violet-100 text-violet-700",
};

export interface SidebarUser {
  name?: string | null;
  role?: string | null;
  avatar?: string | null;
  tenantName?: string | null;
  plan?: string | null;
}

function prettyRole(role?: string | null) {
  if (!role) return "";
  return role
    .toLowerCase()
    .split("_")
    .map((w) => (w[0]?.toUpperCase() ?? "") + w.slice(1))
    .join(" ");
}

export function Sidebar({
  user,
  businesses,
}: {
  user: SidebarUser;
  businesses?: BusinessesResponse;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const plan = (user.plan ?? "Starter").toUpperCase();

  const nav = (
    <>
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 shadow-sm shadow-emerald-600/30">
          <MessageSquare className="h-4 w-4 text-white" />
        </span>
        <span className="text-[15px] font-semibold tracking-tight text-slate-900">WhatsCRM</span>
        <button
          onClick={() => setMobileOpen(false)}
          className="ml-auto rounded-lg p-1 text-slate-400 hover:bg-slate-100 lg:hidden"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="scrollbar-slim flex-1 overflow-y-auto px-3 pb-3">
        {NAV.map((group, gi) => (
          <div key={group.section ?? gi} className={cn(gi > 0 && "mt-5")}>
            {group.section && (
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {group.section}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                      active
                        ? "bg-emerald-50 font-semibold text-emerald-700"
                        : "font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                    )}
                  >
                    {/* The rail is what makes the active row read instantly at a glance. */}
                    {active && (
                      <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-emerald-600" />
                    )}
                    <Icon
                      className={cn(
                        "h-[18px] w-[18px] shrink-0 transition",
                        active ? "text-emerald-600" : "text-slate-400 group-hover:text-slate-500",
                      )}
                    />
                    <span className="truncate">{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* The business switcher replaces the old static workspace label: it names the
          current business and lets the user switch the entire CRM context in place. */}
      <div className="shrink-0 space-y-2.5 border-t border-slate-100 p-3">
        <BusinessSwitcher initialData={businesses} />

        <div className="flex items-center gap-2.5">
          <Avatar name={user.name} src={user.avatar} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{user.name ?? "User"}</p>
            <p className="truncate text-xs text-slate-500">{prettyRole(user.role)}</p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              PLAN_STYLE[plan] ?? PLAN_STYLE.STARTER,
            )}
            title={`${user.tenantName ?? "Workspace"} · ${plan}`}
          >
            {plan}
          </span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3.5 z-30 rounded-lg bg-white p-2 text-slate-600 shadow-sm ring-1 ring-slate-900/5 lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200/70 bg-white lg:flex">
        {nav}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="relative flex h-full w-64 flex-col bg-white shadow-xl">{nav}</aside>
        </div>
      )}
    </>
  );
}
