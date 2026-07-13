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
  Bot,
  Ticket,
  BarChart2,
  BookOpen,
  Sparkles,
  UserCog,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui";

const NAV = [
  { href: "/inbox", label: "Inbox", icon: MessageSquare },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/leads", label: "Leads", icon: Target },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/chatbot", label: "Chatbot", icon: Bot },
  { href: "/tickets", label: "Tickets", icon: Ticket },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/knowledge-base", label: "Knowledge Base", icon: BookOpen },
  { href: "/ai-settings", label: "AI Settings", icon: Sparkles },
  { href: "/team", label: "Team", icon: UserCog },
  { href: "/settings", label: "Settings", icon: Settings },
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

export function Sidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const plan = (user.plan ?? "STARTER").toUpperCase();

  const nav = (
    <>
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-slate-200 px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600">
          <MessageSquare className="h-4 w-4 text-white" />
        </span>
        <span className="text-lg font-bold tracking-tight text-slate-900">WhatsCRM</span>
        <button
          onClick={() => setMobileOpen(false)}
          className="ml-auto rounded-lg p-1 text-slate-400 hover:bg-slate-100 lg:hidden"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="scrollbar-slim flex-1 space-y-1 overflow-y-auto p-3">
        <p className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Workspace
        </p>
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                active
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              <Icon
                className={cn("h-4.5 w-4.5 shrink-0", active ? "text-emerald-600" : "text-slate-400")}
              />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-slate-200 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <Avatar name={user.name} src={user.avatar} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{user.name ?? "User"}</p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="truncate text-xs text-slate-500">
                {user.role?.replace(/_/g, " ").toLowerCase()}
              </span>
              <span
                className={cn(
                  "rounded px-1.5 py-px text-[10px] font-semibold uppercase",
                  PLAN_STYLE[plan] ?? PLAN_STYLE.STARTER,
                )}
              >
                {plan}
              </span>
            </div>
          </div>
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
      {/* Mobile trigger — sits above the topbar's left edge. */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3.5 z-30 rounded-lg border border-slate-200 bg-white p-2 text-slate-600 shadow-sm lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Desktop rail */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        {nav}
      </aside>

      {/* Mobile drawer */}
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
