// TODO [HEMANT]: Build the dashboard shell layout.
//
// Layout structure:
//   ┌─────────┬────────────────────────────────┐
//   │         │  TopBar (workspace name, search │
//   │ Sidebar │  notifications, user avatar)    │
//   │         ├────────────────────────────────┤
//   │         │                                │
//   │  Nav    │   {children}                   │
//   │  Items  │                                │
//   │         │                                │
//   └─────────┴────────────────────────────────┘
//
// Sidebar nav items (with icons from lucide-react):
//   - Inbox          (MessageSquare)
//   - Contacts       (Users)
//   - Leads          (Target)
//   - Campaigns      (Megaphone)
//   - Chatbot        (Bot)
//   - Tickets        (Ticket)
//   - Analytics      (BarChart2)
//   - Knowledge Base (BookOpen)
//   - AI Settings    (Sparkles)
//   - Team           (UserCog)
//   - Settings       (Settings)
//
// Sidebar should be collapsible on mobile (hamburger menu).
// Active route should be highlighted.
// Bottom of sidebar: User avatar, name, role, logout button.

import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* TODO [HEMANT]: Replace with <Sidebar /> component */}
      <aside className="w-64 bg-white border-r flex flex-col shrink-0">
        <div className="h-16 border-b flex items-center px-6">
          <span className="font-bold text-lg text-green-600">WhatsCRM</span>
        </div>
        <nav className="flex-1 p-4">
          {/* TODO [HEMANT]: Build nav items with icons and active state */}
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-3">Menu</p>
          {[
            { href: "/inbox", label: "Inbox" },
            { href: "/contacts", label: "Contacts" },
            { href: "/leads", label: "Leads" },
            { href: "/campaigns", label: "Campaigns" },
            { href: "/chatbot", label: "Chatbot" },
            { href: "/tickets", label: "Tickets" },
            { href: "/analytics", label: "Analytics" },
            { href: "/knowledge-base", label: "Knowledge Base" },
            { href: "/ai-settings", label: "AI Settings" },
            { href: "/team", label: "Team" },
            { href: "/settings", label: "Settings" },
          ].map((item) => (
            <a key={item.href} href={item.href} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-green-50 hover:text-green-700 mb-1">
              {item.label}
            </a>
          ))}
        </nav>
        <div className="border-t p-4">
          <p className="text-sm font-medium text-gray-900">{session.user.name}</p>
          <p className="text-xs text-gray-500">{session.user.role}</p>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* TODO [HEMANT]: Replace with <TopBar /> component */}
        <header className="h-16 border-b bg-white flex items-center justify-between px-6 shrink-0">
          <span className="text-sm font-medium text-gray-600">{session.user.tenantName}</span>
          <div className="flex items-center gap-3">
            {/* TODO [HEMANT]: Notification bell, search, user dropdown */}
            <div className="h-8 w-8 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-semibold">
              {session.user.name?.[0]?.toUpperCase()}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
