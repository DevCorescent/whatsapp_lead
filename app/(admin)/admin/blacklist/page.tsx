"use client";

import { useState } from "react";
import { Building2, Globe } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/ui";
import { BlacklistManager } from "@/components/blacklist/BlacklistManager";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "all",      label: "All account blacklists", icon: Building2,
    description: "Every number blocked by any account or reseller on the platform." },
  { key: "platform", label: "Platform blacklist",     icon: Globe,
    description: "Numbers no account on the platform can message. Managed by super admin." },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default function AdminBlacklistPage() {
  const [tab, setTab] = useState<Tab>("all");
  const active = TABS.find((t) => t.key === tab)!;

  return (
    <div>
      <AdminPageHeader
        title="Blacklist"
        description="View numbers blocked by any account, or manage the platform-wide blocklist."
      />

      {/* Tab switcher */}
      <div className="mb-5 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition",
              tab === t.key
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      <p className="mb-4 text-sm text-slate-500">{active.description}</p>

      <BlacklistManager scope={tab} />
    </div>
  );
}
