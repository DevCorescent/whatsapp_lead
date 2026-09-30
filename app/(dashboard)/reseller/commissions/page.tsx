"use client";

// Reseller → Commissions: what each referred client's payments earned.

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { IndianRupee } from "lucide-react";
import { Badge, Button, Card, EmptyState, PageHeader, SkeletonRows } from "@/components/ui";
import { api, money, STATUS_TONE, Tile } from "@/components/reseller/shared";
import { cn, formatDate } from "@/lib/utils";

interface Row {
  id: string; baseMinor: number; amountMinor: number; rate: number; currency: string; status: string;
  createdAt: string; paidAt: string | null; note: string | null;
  client: { id: string; name: string };
  payment: { purpose: string; provider: string };
}

const FILTERS = ["ALL", "PENDING", "PAID", "CANCELLED"] as const;

export default function ResellerCommissionsPage() {
  const [status, setStatus] = useState<(typeof FILTERS)[number]>("ALL");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["reseller", "commissions", status, page],
    queryFn: () =>
      api<{ data: Row[]; totals: Record<string, number>; pagination: { page: number; totalPages: number } }>(
        `/api/reseller/commissions?page=${page}${status === "ALL" ? "" : `&status=${status}`}`,
      ),
    placeholderData: keepPreviousData,
  });

  const totals = data?.totals ?? {};
  const rows = data?.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader title="Commissions" description="Earned on every payment made by clients you referred." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label="Pending payout" value={money(totals.PENDING)} tone="amber" />
        <Tile label="Paid to you" value={money(totals.PAID)} tone="emerald" />
        <Tile label="Cancelled" value={money(totals.CANCELLED)} hint="e.g. refunded payments" />
      </div>

      <Card className="overflow-hidden">
        <div className="flex gap-1 border-b border-slate-100 p-3">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => { setStatus(f); setPage(1); }}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition",
                status === f ? "bg-emerald-50 text-emerald-700" : "text-slate-500 hover:bg-slate-50",
              )}
            >
              {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        {isLoading ? (
          <div className="p-4"><SkeletonRows rows={5} /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon={IndianRupee} title="No commission yet" description="It appears here when a client you referred pays for a plan." />
        ) : (
          <div className="scrollbar-slim overflow-x-auto">
            <table className="w-full min-w-2xl text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Client</th>
                  <th className="px-4 py-2.5 font-medium">Payment</th>
                  <th className="px-4 py-2.5 font-medium">Rate</th>
                  <th className="px-4 py-2.5 font-medium">Commission</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{formatDate(r.createdAt)}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{r.client.name}</td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-600">
                      {money(r.baseMinor, r.currency)} <span className="text-xs text-slate-400">· {r.payment.purpose.replace("_", " ")}</span>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-600">{r.rate}%</td>
                    <td className="px-4 py-2.5 font-medium tabular-nums text-slate-900">{money(r.amountMinor, r.currency)}</td>
                    <td className="px-4 py-2.5">
                      <Badge className={STATUS_TONE[r.status] ?? ""}>{r.status}</Badge>
                      {r.paidAt && <span className="ml-2 text-xs text-slate-400">{formatDate(r.paidAt)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.pagination.totalPages > 1 && (
          <div className="flex justify-end gap-1 border-t border-slate-100 px-4 py-2.5">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button variant="secondary" size="sm" disabled={page >= data.pagination.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
