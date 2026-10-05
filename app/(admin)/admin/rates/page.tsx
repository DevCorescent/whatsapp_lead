"use client";

// Super admin → message prices: what each WhatsApp template message costs, per
// category. No price means that category stays free.
// Resellers may charge their own clients more (never less).

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { AdminButton, AdminPageHeader, AdminPanel, AdminSkeletonRows } from "@/components/admin/ui";

const LABEL: Record<string, string> = {
  WA_MARKETING: "WhatsApp — marketing template",
  WA_UTILITY: "WhatsApp — utility template",
  WA_AUTHENTICATION: "WhatsApp — authentication template",
};

export default function AdminRatesPage() {
  const qc = useQueryClient();
  const [edits, setEdits] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "rates"],
    queryFn: async () => {
      const res = await fetch("/api/admin/rates");
      if (!res.ok) throw new Error("Failed to load prices");
      return (await res.json()).data as { category: string; priceMinor: number | null }[];
    },
  });

  const save = useMutation({
    mutationFn: async (v: { category: string; priceMinor: number | null }) => {
      const res = await fetch("/api/admin/rates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed");
    },
    onSuccess: (_d, v) => {
      setEdits((e) => { const n = { ...e }; delete n[v.category]; return n; });
      qc.invalidateQueries({ queryKey: ["admin", "rates"] });
    },
  });

  return (
    <>
      <AdminPageHeader title="Message prices" description="What each message costs clients' wallets, in paise per unit (₹0.20 = 20)." />
      <AdminPanel title="Platform prices" subtitle="Resellers can set higher prices for their own clients">
        {isLoading || !data ? (
          <AdminSkeletonRows rows={6} />
        ) : (
          <div className="space-y-3">
            {data.map((r) => {
              const value = edits[r.category] ?? (r.priceMinor === null ? "" : String(r.priceMinor));
              const dirty = r.category in edits;
              return (
                <div key={r.category} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <span className="text-sm text-slate-700 sm:w-72">{LABEL[r.category] ?? r.category}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      value={value}
                      placeholder="Not set — free"
                      onChange={(e) => setEdits((x) => ({ ...x, [r.category]: e.target.value }))}
                      className="h-10 w-36 rounded-lg sm:h-9 sm:w-44 bg-white px-3 text-sm ring-1 ring-inset ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      aria-label={`Price for ${LABEL[r.category]}`}
                    />
                    <span className="text-xs text-slate-500">paise{value && ` = ₹${(Number(value) / 100).toFixed(2)}`}</span>
                    {dirty && (
                      <AdminButton
                        size="sm"
                        disabled={save.isPending}
                        onClick={() => save.mutate({ category: r.category, priceMinor: value === "" ? null : Math.round(Number(value)) })}
                      >
                        Save
                      </AdminButton>
                    )}
                  </div>
                </div>
              );
            })}
            {save.isError && <p className="text-xs text-rose-700">{(save.error as Error).message}</p>}
            <p className="flex items-start gap-1.5 pt-2 text-xs text-slate-500">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Charged per WhatsApp template message sent by a campaign or broadcast; inbox replies are never charged.
            </p>
          </div>
        )}
      </AdminPanel>
    </>
  );
}
