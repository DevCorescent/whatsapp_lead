"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Building2, MessageSquare, CreditCard, Bell, KanbanSquare } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { GeneralTab } from "@/components/settings/GeneralTab";
import { WhatsAppTab } from "@/components/settings/WhatsAppTab";
import { BillingTab } from "@/components/settings/BillingTab";
import { NotificationsTab } from "@/components/settings/NotificationsTab";
import { LeadStagesTab } from "@/components/settings/LeadStagesTab";
import { cn } from "@/lib/utils";

/** Managing pipeline stages is an admin action — same allowlist as the backend guard. */
const STAGE_ADMIN_ROLES = ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"];

const TABS = [
  { key: "general", label: "General", icon: Building2, adminOnly: false },
  { key: "pipeline", label: "Lead Pipeline Stages", icon: KanbanSquare, adminOnly: true },
  { key: "whatsapp", label: "WhatsApp", icon: MessageSquare, adminOnly: false },
  { key: "billing", label: "Billing", icon: CreditCard, adminOnly: false },
  { key: "notifications", label: "Notifications", icon: Bell, adminOnly: false },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function SettingsPage() {
  const { data: session } = useSession();
  const isStageAdmin = STAGE_ADMIN_ROLES.includes(session?.user?.role ?? "");

  const [tab, setTab] = useState<TabKey>("general");

  // The stage manager tab is hidden from non-admins on the frontend (the API enforces it too),
  // and selecting it via a stale state falls back to General.
  const visibleTabs = TABS.filter((t) => !t.adminOnly || isStageAdmin);
  const activeTab = visibleTabs.some((t) => t.key === tab) ? tab : "general";

  return (
    <div>
      <PageHeader title="Settings" description="Manage your workspace, channel and billing." />

      <div
        role="tablist"
        aria-label="Settings sections"
        className="scrollbar-slim mb-6 flex gap-1 overflow-x-auto border-b border-slate-200"
      >
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={activeTab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition",
              activeTab === t.key
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
        {activeTab === "general" && <GeneralTab />}
        {activeTab === "pipeline" && isStageAdmin && <LeadStagesTab />}
        {activeTab === "whatsapp" && <WhatsAppTab />}
        {activeTab === "billing" && <BillingTab />}
        {activeTab === "notifications" && <NotificationsTab />}
      </div>
    </div>
  );
}
