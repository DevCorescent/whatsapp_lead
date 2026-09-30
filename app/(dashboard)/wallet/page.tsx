"use client";

// Wallet: prepaid message credit. Balance, top-up (Razorpay), low-balance alert,
// this account's message prices, and the statement (with CSV download).

import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Download, Loader2, Plus, Wallet } from "lucide-react";
import { Badge, Button, Card, EmptyState, PageHeader, SkeletonRows } from "@/components/ui";
import { openRazorpay } from "@/components/billing/razorpayCheckout";
import { api, money } from "@/components/reseller/shared";
import { cn, formatDate } from "@/lib/utils";

interface Txn {
  id: string; type: string; amountMinor: number; balanceAfterMinor: number; description: string | null; createdAt: string;
}
interface WalletData {
  balanceMinor: number;
  lowBalanceThresholdMinor: number;
  rates: { category: string; priceMinor: number | null }[];
  canTopUp: boolean;
  transactions: Txn[];
}

const PRESETS = [50_000, 100_000, 500_000]; // ₹500, ₹1,000, ₹5,000

const CATEGORY_LABEL: Record<string, string> = {
  WA_MARKETING: "WhatsApp — marketing template",
  WA_UTILITY: "WhatsApp — utility template",
  WA_AUTHENTICATION: "WhatsApp — authentication template",
};

const TYPE_TONE: Record<string, string> = {
  TOPUP: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  TRANSFER_IN: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  REFUND: "bg-sky-50 text-sky-700 ring-sky-600/20",
  DEBIT: "bg-slate-100 text-slate-600 ring-slate-500/20",
  TRANSFER_OUT: "bg-amber-50 text-amber-800 ring-amber-600/20",
  ADJUSTMENT: "bg-violet-50 text-violet-700 ring-violet-600/20",
};

export default function WalletPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [amount, setAmount] = useState("1000");
  const [threshold, setThreshold] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["wallet", page],
    queryFn: () => api<{ data: WalletData; pagination: { page: number; totalPages: number } }>(`/api/wallet?page=${page}`),
    placeholderData: keepPreviousData,
  });

  const topUp = useMutation({
    mutationFn: async () => {
      const amountMinor = Math.round(Number(amount) * 100);
      const order = await api<{ data: { orderId: string; amount: number; currency: string; keyId: string; brandName: string; brandColor: string } }>(
        "/api/wallet/topup",
        { method: "POST", json: { amountMinor } },
      );
      const paid = await openRazorpay({
        keyId: order.data.keyId,
        orderId: order.data.orderId,
        amount: order.data.amount,
        currency: order.data.currency,
        name: order.data.brandName,
        description: "Wallet top-up",
        color: order.data.brandColor,
      });
      if (!paid) return null;
      return api<{ data: { balanceMinor: number } }>("/api/wallet/topup", { method: "PUT", json: paid });
    },
    onSuccess: (r) => {
      if (r) setNotice({ ok: true, text: `Top-up successful. New balance ${money(r.data.balanceMinor)}.` });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (e: Error) => setNotice({ ok: false, text: e.message }),
  });

  const saveThreshold = useMutation({
    mutationFn: () =>
      api("/api/wallet", { method: "PATCH", json: { lowBalanceThresholdMinor: Math.round(Number(threshold) * 100) } }),
    onSuccess: () => { setThreshold(null); qc.invalidateQueries({ queryKey: ["wallet"] }); },
    onError: (e: Error) => setNotice({ ok: false, text: e.message }),
  });

  if (isLoading) return <SkeletonRows rows={6} />;
  if (isError || !data) return <Card className="p-6 text-sm text-rose-700">{(error as Error)?.message ?? "Couldn't load the wallet."}</Card>;
  const w = data.data;
  const low = w.balanceMinor < w.lowBalanceThresholdMinor;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Wallet"
        description="Prepaid credit for messages. Each priced WhatsApp message is charged when it's sent."
        action={
          <a href="/api/wallet?format=csv" className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-3.5 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-inset ring-slate-200 hover:bg-slate-50">
            <Download className="h-4 w-4" /> Statement (CSV)
          </a>
        }
      />

      {notice && (
        <p className={cn("flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm", notice.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700")}>
          {notice.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />} {notice.text}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Balance</p>
          <p className={cn("mt-1 text-4xl font-semibold tabular-nums", low ? "text-amber-700" : "text-slate-900")}>{money(w.balanceMinor)}</p>
          {low && <p className="mt-1 text-sm text-amber-700">Below your alert level — campaigns pause when it runs out.</p>}

          {w.canTopUp && (
            <div className="mt-5">
              <p className="mb-2 text-sm font-medium text-slate-700">Add credit</p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setAmount(String(p / 100))}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition",
                      Number(amount) * 100 === p ? "bg-emerald-50 text-emerald-700 ring-emerald-300" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
                    )}
                  >
                    {money(p)}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <div className="flex items-center rounded-lg bg-white shadow-sm ring-1 ring-inset ring-slate-200 focus-within:ring-2 focus-within:ring-emerald-500 sm:w-48">
                  <span className="pl-3 text-sm text-slate-400">₹</span>
                  <input
                    type="number"
                    min={100}
                    max={500000}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full rounded-lg bg-transparent px-2 py-2 text-sm focus:outline-none"
                    aria-label="Top-up amount in rupees"
                  />
                </div>
                <Button disabled={topUp.isPending || !(Number(amount) >= 100)} onClick={() => { setNotice(null); topUp.mutate(); }}>
                  {topUp.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Top up
                </Button>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">Minimum ₹100. Paid securely through Razorpay.</p>
            </div>
          )}
        </Card>

        <Card className="space-y-4 p-5">
          <div>
            <p className="text-sm font-semibold text-slate-900">Low-balance alert</p>
            <p className="mt-0.5 text-xs text-slate-500">Account owners are emailed once when the balance drops below this.</p>
            <div className="mt-2 flex gap-2">
              <div className="flex flex-1 items-center rounded-lg bg-white shadow-sm ring-1 ring-inset ring-slate-200">
                <span className="pl-3 text-sm text-slate-400">₹</span>
                <input
                  type="number"
                  min={0}
                  value={threshold ?? String(w.lowBalanceThresholdMinor / 100)}
                  onChange={(e) => setThreshold(e.target.value)}
                  disabled={!w.canTopUp}
                  className="w-full rounded-lg bg-transparent px-2 py-2 text-sm focus:outline-none"
                  aria-label="Low-balance alert amount"
                />
              </div>
              {threshold !== null && (
                <Button size="sm" className="h-9" disabled={saveThreshold.isPending} onClick={() => saveThreshold.mutate()}>Save</Button>
              )}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Your prices</p>
            <ul className="mt-2 space-y-1 text-sm">
              {w.rates.map((r) => (
                <li key={r.category} className="flex justify-between gap-3">
                  <span className="text-slate-600">{CATEGORY_LABEL[r.category] ?? r.category}</span>
                  <span className="shrink-0 tabular-nums text-slate-900">
                    {r.priceMinor === null ? "Free" : money(r.priceMinor)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-900">Statement</h2>
        {w.transactions.length === 0 ? (
          <EmptyState icon={Wallet} title="No transactions yet" description="Top-ups, message charges and refunds appear here." />
        ) : (
          <div className="scrollbar-slim overflow-x-auto">
            <table className="w-full min-w-2xl text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Details</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-4 py-2.5 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {w.transactions.map((t) => (
                  <tr key={t.id}>
                    <td className="whitespace-nowrap px-4 py-2 text-slate-600">{formatDate(t.createdAt)}</td>
                    <td className="px-4 py-2"><Badge className={TYPE_TONE[t.type] ?? ""}>{t.type.replace("_", " ")}</Badge></td>
                    <td className="max-w-xs truncate px-4 py-2 text-slate-600">{t.description ?? "—"}</td>
                    <td className={cn("px-4 py-2 text-right tabular-nums", t.amountMinor < 0 ? "text-slate-700" : "text-emerald-700")}>
                      {t.amountMinor > 0 ? "+" : ""}{money(t.amountMinor)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-900">{money(t.balanceAfterMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.pagination.totalPages > 1 && (
          <div className="flex justify-end gap-1 border-t border-slate-100 px-4 py-2.5">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button variant="secondary" size="sm" disabled={page >= data.pagination.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
