"use client";

// Super admin → white-label: the monthly fee (dynamic), the grace period, and
// every white-label reseller with its address, fee status and wallet.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Palette } from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
  AdminSkeletonRows,
  AdminTable,
  tdClass,
  thClass,
} from "@/components/admin/ui";
import { cn } from "@/lib/utils";

interface Row {
  id: string;
  name: string;
  isActive: boolean;
  clients: number;
  brand: { brandName: string; domain: string | null; subdomain: string | null; isActive: boolean } | null;
  walletMinor: number;
  fee: { period: string; feeMinor: number; isOverride: boolean; paid: boolean; dueSince: string | null; suspended: boolean; suspendedReason: string | null } | null;
}
interface Data {
  config: { whiteLabelFeeMinor: number; whiteLabelGraceDays: number };
  rootDomain: string | null;
  resellers: Row[];
}

const inr = (m: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(m / 100);
const inputCls = "h-9 rounded-lg bg-white px-3 text-sm ring-1 ring-inset ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500";

async function call(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json;
}

export default function AdminWhiteLabelPage() {
  const qc = useQueryClient();
  const [fee, setFee] = useState<string | null>(null);
  const [grace, setGrace] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "white-label"],
    queryFn: async () => {
      const res = await fetch("/api/admin/white-label");
      if (!res.ok) throw new Error("Failed to load");
      return (await res.json()).data as Data;
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "white-label"] });

  const saveSettings = useMutation({
    mutationFn: () =>
      call("/api/admin/white-label", "PUT", {
        ...(fee !== null && { whiteLabelFeeMinor: Math.round(Number(fee) * 100) }),
        ...(grace !== null && { whiteLabelGraceDays: Math.round(Number(grace)) }),
      }),
    onSuccess: () => { setFee(null); setGrace(null); refresh(); },
  });
  const act = useMutation({
    mutationFn: (v: { id: string; body: Record<string, unknown> }) => call(`/api/admin/white-label/${v.id}`, "PATCH", v.body),
    onSuccess: (_d, v) => { setOverrides((o) => { const n = { ...o }; delete n[v.id]; return n; }); refresh(); },
  });

  return (
    <>
      <AdminPageHeader
        title="White-label"
        description="The monthly fee white-label resellers pay from their wallet, and the state of every white-label brand."
      />

      <AdminPanel title="Fee settings" subtitle="Charged on the first daily run of each month; unpaid brands pause after the grace period">
        {data ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="text-sm text-slate-600">
              Monthly fee (₹)
              <input
                type="number"
                min={0}
                value={fee ?? String(data.config.whiteLabelFeeMinor / 100)}
                onChange={(e) => setFee(e.target.value)}
                className={cn(inputCls, "mt-1 block w-40")}
              />
            </label>
            <label className="text-sm text-slate-600">
              Grace period (days)
              <input
                type="number"
                min={0}
                max={90}
                value={grace ?? String(data.config.whiteLabelGraceDays)}
                onChange={(e) => setGrace(e.target.value)}
                className={cn(inputCls, "mt-1 block w-32")}
              />
            </label>
            <AdminButton disabled={(fee === null && grace === null) || saveSettings.isPending} onClick={() => saveSettings.mutate()}>
              Save
            </AdminButton>
            <p className="text-xs text-slate-500 sm:ml-2">0 = free. {data.rootDomain ? `Free subdomains: *.${data.rootDomain}` : "Set PLATFORM_ROOT_DOMAIN to offer free subdomains."}</p>
          </div>
        ) : (
          <AdminSkeletonRows rows={1} />
        )}
        {saveSettings.isError && <p className="mt-2 text-xs text-rose-700">{(saveSettings.error as Error).message}</p>}
      </AdminPanel>

      <div className="mt-6">
        {act.isError && <p className="mb-2 text-xs text-rose-700">{(act.error as Error).message}</p>}
        {isLoading ? (
          <AdminSkeletonRows rows={5} />
        ) : !data || data.resellers.length === 0 ? (
          <AdminEmptyState icon={Palette} title="No white-label resellers yet" description="Create one from Tenants → Provision." />
        ) : (
          <AdminTable>
            <thead>
              <tr>
                <th className={thClass}>Reseller</th>
                <th className={thClass}>Address</th>
                <th className={thClass}>Clients</th>
                <th className={thClass}>Wallet</th>
                <th className={thClass}>Fee this month</th>
                <th className={thClass}>Own fee (₹)</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.resellers.map((r) => {
                const address = r.brand?.domain ?? (r.brand?.subdomain && data.rootDomain ? `${r.brand.subdomain}.${data.rootDomain}` : null);
                const overrideValue = overrides[r.id] ?? (r.fee?.isOverride ? String(r.fee.feeMinor / 100) : "");
                return (
                  <tr key={r.id}>
                    <td className={tdClass}>
                      <p className="font-medium text-slate-900">{r.brand?.brandName ?? r.name}</p>
                      <p className="text-xs text-slate-500">{r.name}</p>
                    </td>
                    <td className={tdClass}>{address ?? <span className="text-slate-400">—</span>}</td>
                    <td className={tdClass}>{r.clients}</td>
                    <td className={tdClass}>{inr(r.walletMinor)}</td>
                    <td className={tdClass}>
                      {!r.fee ? (
                        <span className="text-xs text-slate-400">Branding not set up</span>
                      ) : r.fee.suspended ? (
                        <AdminBadge tone="rose">Suspended</AdminBadge>
                      ) : r.fee.feeMinor <= 0 ? (
                        <AdminBadge tone="slate">Free</AdminBadge>
                      ) : r.fee.paid ? (
                        <AdminBadge tone="emerald">Paid {inr(r.fee.feeMinor)}</AdminBadge>
                      ) : (
                        <AdminBadge tone="amber">Due {inr(r.fee.feeMinor)}</AdminBadge>
                      )}
                    </td>
                    <td className={tdClass}>
                      {r.fee && (
                        <span className="inline-flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            value={overrideValue}
                            placeholder="Default"
                            onChange={(e) => setOverrides((o) => ({ ...o, [r.id]: e.target.value }))}
                            className={cn(inputCls, "w-24")}
                            aria-label={`Fee for ${r.name}`}
                          />
                          {r.id in overrides && (
                            <AdminButton
                              size="sm"
                              disabled={act.isPending}
                              onClick={() =>
                                act.mutate({
                                  id: r.id,
                                  body: { feeOverrideMinor: overrideValue === "" ? null : Math.round(Number(overrideValue) * 100) },
                                })
                              }
                            >
                              Save
                            </AdminButton>
                          )}
                        </span>
                      )}
                    </td>
                    <td className={cn(tdClass, "text-right")}>
                      {r.fee && (
                        <span className="inline-flex gap-1">
                          {!r.fee.paid && r.fee.feeMinor > 0 && (
                            <AdminButton size="sm" variant="secondary" disabled={act.isPending} onClick={() => act.mutate({ id: r.id, body: { action: "charge" } })}>
                              Charge now
                            </AdminButton>
                          )}
                          {r.fee.suspended ? (
                            <AdminButton size="sm" disabled={act.isPending} onClick={() => act.mutate({ id: r.id, body: { action: "reactivate" } })}>
                              Reactivate
                            </AdminButton>
                          ) : (
                            <AdminButton size="sm" variant="ghost" disabled={act.isPending} onClick={() => act.mutate({ id: r.id, body: { action: "suspend" } })}>
                              Suspend
                            </AdminButton>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </AdminTable>
        )}
      </div>
    </>
  );
}
