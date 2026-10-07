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
  FileText,
  Send,
  Ban,
  LayoutDashboard,
  Building2,
  CreditCard,
  IndianRupee,
  Palette,
  Filter,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui";
import { BusinessSwitcher } from "@/components/dashboard/BusinessSwitcher";

/** Grouped so eleven links don't read as one undifferentiated wall. */
const NAV = [
  {
    section: null,
    items: [
      { href: "/inbox", label: "Inbox", icon: MessageSquare, roles: null },
      { href: "/contacts", label: "Contacts", icon: Users, roles: null },
      { href: "/leads", label: "Leads", icon: Target, roles: null },
    ],
  },
  {
    section: "Automate",
    items: [
      { href: "/campaigns", label: "Campaigns", icon: Megaphone, roles: ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN", "MANAGER", "MARKETING_USER"] },
      { href: "/segments", label: "Segments", icon: Filter, roles: ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN", "MANAGER", "MARKETING_USER"] },
      { href: "/broadcast", label: "Bulk Broadcast", icon: Send, roles: ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN", "MANAGER", "MARKETING_USER"] },
      { href: "/templates", label: "Templates", icon: FileText, roles: ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN", "MANAGER", "MARKETING_USER"] },
      { href: "/chatbot", label: "Chatbot", icon: Bot, roles: ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN", "MANAGER"] },
      { href: "/ai-settings", label: "AI Settings", icon: Sparkles, roles: ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN", "MANAGER"] },
      { href: "/knowledge-base", label: "Knowledge Base", icon: BookOpen, roles: ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN", "MANAGER"] },
    ],
  },
  {
    section: "Manage",
    items: [
      { href: "/tickets", label: "Tickets", icon: Ticket, roles: null },
      { href: "/analytics", label: "Analytics", icon: BarChart2, roles: ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN", "MANAGER", "MARKETING_USER"] },
      { href: "/blacklist", label: "Blacklist", icon: Ban, roles: ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN", "MANAGER", "MARKETING_USER"] },
      { href: "/team", label: "Team", icon: UserCog, roles: ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN", "MANAGER"] },
      { href: "/billing", label: "Billing & Plan", icon: CreditCard, roles: ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"] },
      { href: "/settings", label: "Settings", icon: Settings, roles: ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN", "MANAGER"] },
    ],
  },
];

/**
 * A reseller account manages client accounts and never works inside one, so it
 * gets its own menu — no inbox, contacts or campaigns (the API refuses those too).
 */
const RESELLER_NAV = [
  {
    section: null,
    items: [
      { href: "/reseller", label: "Overview", icon: LayoutDashboard, roles: null },
      { href: "/reseller/clients", label: "Clients", icon: Building2, roles: null },
      { href: "/reseller/plans", label: "Plans", icon: CreditCard, roles: ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"] },
      { href: "/reseller/commissions", label: "Commissions", icon: IndianRupee, roles: ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN", "MANAGER"] },
      { href: "/billing", label: "Billing & Plan", icon: CreditCard, roles: ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"] },
      { href: "/reseller/branding", label: "Branding", icon: Palette, roles: ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"], whiteLabelOnly: true },
    ],
  },
  {
    section: "Manage",
    items: [
      { href: "/team", label: "Team", icon: UserCog, roles: ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN", "MANAGER"] },
      { href: "/settings", label: "Settings", icon: Settings, roles: ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"] },
    ],
  },
];

function canSeeNavItem(role: string | null | undefined, allowed: string[] | null) {
  if (!allowed) return true;
  if (!role) return false;
  return allowed.includes(role);
}

export interface SidebarUser {
  name?: string | null;
  role?: string | null;
  avatar?: string | null;
  tenantName?: string | null;
  plan?: string | null;
  accountType?: string | null;
  resellerType?: string | null;
}

/** The brand shown in the sidebar — the platform's, or a white-label reseller's. */
export interface SidebarBrand {
  name: string;
  logoUrl: string | null;
}

function prettyRole(role?: string | null) {
  if (!role) return "";
  return role
    .toLowerCase()
    .split("_")
    .map((w) => (w[0]?.toUpperCase() ?? "") + w.slice(1))
    .join(" ");
}

export function Sidebar({ user, brand }: { user: SidebarUser; brand: SidebarBrand }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isReseller = user.accountType === "RESELLER";
  const groups = isReseller
    ? RESELLER_NAV.map((g) => ({
        ...g,
        items: g.items.filter((i) => !("whiteLabelOnly" in i && i.whiteLabelOnly) || user.resellerType === "WHITE_LABEL"),
      }))
    : NAV;

  const nav = (
    <>
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
        {brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a reseller's logo on its own host
          <img src={brand.logoUrl} alt="" className="h-8 w-8 rounded-lg object-contain" />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 shadow-sm shadow-emerald-600/30">
            <MessageSquare className="h-4 w-4 text-white" />
          </span>
        )}
        <span className="truncate text-[15px] font-semibold tracking-tight text-slate-900">{brand.name}</span>
        <button
          onClick={() => setMobileOpen(false)}
          className="ml-auto rounded-lg p-1 text-slate-400 hover:bg-slate-100 lg:hidden"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="scrollbar-slim flex-1 overflow-y-auto px-3 pb-3">
        {groups.map((group, gi) => {
          const items = group.items.filter((item) => canSeeNavItem(user.role, item.roles));
          if (items.length === 0) return null;
          return (
          <div key={group.section ?? gi} className={cn(gi > 0 && "mt-5")}>
            {group.section && (
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {group.section}
              </p>
            )}
            <div className="space-y-0.5">
              {items.map(({ href, label, icon: Icon }) => {
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
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-slate-100 p-3">
        {/* Current plan chip — only for client accounts that have a plan loaded */}
        {!isReseller && user.plan && (
          <Link
            href="/billing"
            className="mb-2.5 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs ring-1 ring-slate-200 transition hover:bg-emerald-50 hover:ring-emerald-200"
          >
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Current plan</p>
              <p className="truncate font-semibold text-slate-800">{user.plan}</p>
            </div>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          </Link>
        )}

        <div className="flex items-center gap-2.5">
          <Avatar name={user.name} src={user.avatar} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{user.name ?? "User"}</p>
            <p className="truncate text-xs text-slate-500">{prettyRole(user.role)}</p>
          </div>
          <button
            onClick={() => signOut({ redirect: false }).then(() => { window.location.href = "/login"; })}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        {/* Businesses are client workspaces; a reseller account has none. */}
        {!isReseller && (
          <div className="mt-2.5">
            <BusinessSwitcher />
          </div>
        )}
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
