"use client";

import { useState } from "react";
import { Building2, MessageSquare, CreditCard, Bell } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { GeneralTab } from "@/components/settings/GeneralTab";
import { WhatsAppTab } from "@/components/settings/WhatsAppTab";
import { BillingTab } from "@/components/settings/BillingTab";
import { NotificationsTab } from "@/components/settings/NotificationsTab";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "general", label: "General", icon: Building2 },
  { key: "whatsapp", label: "WhatsApp", icon: MessageSquare },
  { key: "billing", label: "Billing", icon: CreditCard },
  { key: "notifications", label: "Notifications", icon: Bell },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function SettingsPage() {
  const [tab, setTab] = useState<TabKey>("general");

  return (
    <div>
      <PageHeader title="Settings" description="Manage your workspace, channel and billing." />

      <div
        role="tablist"
        aria-label="Settings sections"
        className="scrollbar-slim mb-6 flex gap-1 overflow-x-auto border-b border-slate-200"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition",
              tab === t.key
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800",
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="max-w-4xl">
        {tab === "general" && <GeneralTab />}
        {tab === "whatsapp" && <WhatsAppTab />}
        {tab === "billing" && <BillingTab />}
        {tab === "notifications" && <NotificationsTab />}
      </div>
    </div>
  );
}
