"use client";

// Reseller → one client: account, plan, usage counts and commission — never its
// chats or messages. Managed clients can be suspended or moved to another plan.

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, Loader2, Pause, Play } from "lucide-react";
import { Badge, Button, Card, SkeletonRows, inputClass } from "@/components/ui";
import { api, money, rupees, STATUS_TONE, Tile } from "@/components/reseller/shared";
import { formatDate } from "@/lib/utils";

interface Metric { used: number; limit: number }
interface ClientDetail {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  managed: boolean;
  category: { id: string; name: string } | null;
  subscription: {
    status: string; currentPeriodEnd: string; trialEndsAt: string | null;
    plan: { id: string; displayName: string; priceMonthly: number };
  } | null;
  users: { name: string; email: string; role: string; isActive: boolean; lastLoginAt: string | null }[];
  usage: Record<string, Metric>;
  commissions: { id: string; amountMinor: number; baseMinor: number; rate: number; currency: string; status: string; createdAt: string }[];
  walletBalanceMinor: number;
}

const limitText = (m?: Metric) => (!m ? "—" : m.limit > 0 ? `${m.used.toLocaleString()} / ${m.limit.toLocaleString()}` : m.used.toLocaleString());

export default function ResellerClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const [planId, setPlanId] = useState("");
  const [credit, setCredit] = useState("");

  const client = useQuery({
    queryKey: ["reseller", "client", id],
    queryFn: async () => (await api<{ data: ClientDetail }>(`/api/reseller/clients/${id}`)).data,
  });
  const plans = useQuery({
    queryKey: ["reseller", "plans"],
    queryFn: async () =>
      (await api<{ data: { plans: { id: string; displayName: string; priceMonthly: number; isActive: boolean }[]; basePlans: { id: string; displayName: string; priceMonthly: number }[] } }>("/api/reseller/plans")).data,
  });

  const update = useMutation({
    mutationFn: (json: Record<string, unknown>) => api(`/api/reseller/clients/${id}`, { method: "PATCH", json }),
    onSuccess: () => { setPlanId(""); qc.invalidateQueries({ queryKey: ["reseller"] }); },
  });

  const transfer = useMutation({
    mutationFn: () =>
      api(`/api/reseller/clients/${id}/wallet`, { method: "POST", json: { amountMinor: Math.round(Number(credit) * 100) } }),
    onSuccess: () => { setCredit(""); qc.invalidateQueries({ queryKey: ["reseller"] }); },
  });

  if (client.isLoading) return <SkeletonRows rows={6} />;
  if (client.isError || !client.data) {
    return <Card className="p-6 text-sm text-rose-700">{(client.error as Error)?.message ?? "Client not found."}</Card>;
  }
  const c = client.data;
  const own = (plans.data?.plans ?? []).filter((p) => p.isActive);
  const options = own.length ? own : plans.data?.basePlans ?? [];
  const status = !c.isActive ? "SUSPENDED" : c.subscription?.status ?? "—";

  return (
    <div className="space-y-5">
      <Link href="/reseller/clients" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Clients
      </Link>

      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold text-slate-900">
            {c.name} <Badge className={STATUS_TONE[status] ?? ""}>{status}</Badge>
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {c.subscription?.plan.displayName ?? "No plan"}
            {c.subscription && ` · ${rupees(c.subscription.plan.priceMonthly)}/mo · renews ${formatDate(c.subscription.currentPeriodEnd)}`}
            {c.category && ` · ${c.category.name}`}
            {!c.managed && " · referred by you, managed elsewhere"}
          </p>
        </div>
        {c.managed && (
          <Button
            variant={c.isActive ? "danger" : "secondary"}
            disabled={update.isPending}
            onClick={() => update.mutate({ isActive: !c.isActive })}
          >
            {c.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {c.isActive ? "Suspend" : "Reactivate"}
          </Button>
        )}
      </Card>

      {update.isError && (
        <p className="flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {(update.error as Error).message}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Wallet" value={money(c.walletBalanceMinor)} tone="emerald" />
        <Tile label="Contacts" value={limitText(c.usage.contacts)} />
        <Tile label="Messages this period" value={limitText(c.usage.messages)} />
        <Tile label="Users" value={limitText(c.usage.users)} />
        <Tile label="Campaigns this period" value={limitText(c.usage.campaigns)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {c.managed && (
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900">Change plan</h2>
            <p className="mt-1 text-xs text-slate-500">The current billing period is kept; the new plan&apos;s limits apply immediately.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={inputClass} aria-label="New plan">
                <option value="">— Choose a plan —</option>
                {options.filter((p) => p.id !== c.subscription?.plan.id).map((p) => (
                  <option key={p.id} value={p.id}>{p.displayName} · {rupees(p.priceMonthly)}/mo</option>
                ))}
              </select>
              <Button disabled={!planId || update.isPending} onClick={() => update.mutate({ planId })}>
                {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Apply
              </Button>
            </div>
          </Card>
        )}

        {c.managed && (
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900">Add message credit</h2>
            <p className="mt-1 text-xs text-slate-500">Moves credit from your wallet to this client&apos;s.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <div className="flex flex-1 items-center rounded-lg bg-white shadow-sm ring-1 ring-inset ring-slate-200">
                <span className="pl-3 text-sm text-slate-400">₹</span>
                <input type="number" min={1} value={credit} onChange={(e) => setCredit(e.target.value)} className="w-full rounded-lg bg-transparent px-2 py-2 text-sm focus:outline-none" aria-label="Credit to transfer" />
              </div>
              <Button disabled={!(Number(credit) >= 1) || transfer.isPending} onClick={() => transfer.mutate()}>
                {transfer.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Transfer
              </Button>
            </div>
            {transfer.isError && <p className="mt-2 text-xs text-rose-700">{(transfer.error as Error).message}</p>}
          </Card>
        )}

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900">Users</h2>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {c.users.map((u) => (
              <li key={u.email} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-800">{u.name}</span>
                  <span className="block truncate text-xs text-slate-500">{u.email} · {u.role.replace("_", " ").toLowerCase()}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-400">
                  {u.lastLoginAt ? `Last login ${formatDate(u.lastLoginAt)}` : "Never logged in"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-900">Commission from this client</h2>
        {c.commissions.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">No payments from this client yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {c.commissions.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <span className="text-slate-600">
                  {formatDate(m.createdAt)} · {m.rate}% of {money(m.baseMinor, m.currency)}
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-medium tabular-nums text-slate-900">{money(m.amountMinor, m.currency)}</span>
                  <Badge className={STATUS_TONE[m.status] ?? ""}>{m.status}</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
