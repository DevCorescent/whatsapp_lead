"use client";

// Super admin → reseller commissions: every commission, and marking payouts.

import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IndianRupee } from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminEmptyState,
  AdminPageHeader,
  AdminSkeletonRows,
  AdminTable,
  tdClass,
  thClass,
} from "@/components/admin/ui";
import { adminSelectClass } from "@/components/admin/ui";
import { cn, formatDate } from "@/lib/utils";

interface Row {
  id: string; baseMinor: number; amountMinor: number; rate: number; currency: string;
  status: "PENDING" | "PAID" | "CANCELLED"; createdAt: string; paidAt: string | null; note: string | null;
  reseller: { id: string; name: string };
  client: { id: string; name: string };
  payment: { provider: string; providerPaymentId: string; purpose: string };
}

const money = (minor: number, currency = "inr") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: currency.toUpperCase() }).format(minor / 100);

export default function AdminCommissionsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("PENDING");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "commissions", status, page],
    queryFn: async () => {
      const res = await fetch(`/api/admin/commissions?page=${page}${status ? `&status=${status}` : ""}`);
      if (!res.ok) throw new Error("Failed to load commissions");
      return (await res.json()) as { data: Row[]; totals: Record<string, number>; pagination: { page: number; totalPages: number } };
    },
    placeholderData: keepPreviousData,
  });

  const mark = useMutation({
    mutationFn: async (v: { id: string; status: Row["status"] }) => {
      const res = await fetch(`/api/admin/commissions/${v.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: v.status }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Update failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "commissions"] }),
  });

  const rows = data?.data ?? [];
  const totals = data?.totals ?? {};

  return (
    <>
      <AdminPageHeader
        title="Reseller commissions"
        description={`Pending ${money(totals.PENDING ?? 0)} · Paid ${money(totals.PAID ?? 0)} · Cancelled ${money(totals.CANCELLED ?? 0)}`}
        action={
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={cn(adminSelectClass, "w-40")} aria-label="Filter by status">
            <option value="PENDING">Pending</option>
            <option value="PAID">Paid</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="">All</option>
          </select>
        }
      />
      {mark.isError && <p className="mb-3 text-xs text-rose-700">{(mark.error as Error).message}</p>}
      {isLoading ? (
        <AdminSkeletonRows rows={6} />
      ) : rows.length === 0 ? (
        <AdminEmptyState icon={IndianRupee} title="No commissions" description="Commissions appear when a referred client pays." />
      ) : (
        <AdminTable>
          <thead>
            <tr>
              <th className={thClass}>Date</th>
              <th className={thClass}>Reseller</th>
              <th className={thClass}>Client</th>
              <th className={thClass}>Payment</th>
              <th className={thClass}>Commission</th>
              <th className={thClass}>Status</th>
              <th className={thClass} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={tdClass}>{formatDate(r.createdAt)}</td>
                <td className={tdClass}>{r.reseller.name}</td>
                <td className={tdClass}>{r.client.name}</td>
                <td className={tdClass}>
                  {money(r.baseMinor, r.currency)}
                  <span className="block text-[11px] text-slate-400">{r.payment.provider} · {r.payment.purpose.replace("_", " ")}</span>
                </td>
                <td className={cn(tdClass, "font-medium")}>{money(r.amountMinor, r.currency)} <span className="text-xs text-slate-400">({r.rate}%)</span></td>
                <td className={tdClass}>
                  <AdminBadge tone={r.status === "PAID" ? "emerald" : r.status === "PENDING" ? "amber" : "slate"}>{r.status}</AdminBadge>
                  {r.paidAt && <span className="ml-1 text-[11px] text-slate-400">{formatDate(r.paidAt)}</span>}
                </td>
                <td className={cn(tdClass, "text-right")}>
                  {r.status === "PENDING" && (
                    <span className="inline-flex gap-1">
                      <AdminButton size="sm" disabled={mark.isPending} onClick={() => mark.mutate({ id: r.id, status: "PAID" })}>Mark paid</AdminButton>
                      <AdminButton size="sm" variant="ghost" disabled={mark.isPending} onClick={() => mark.mutate({ id: r.id, status: "CANCELLED" })}>Cancel</AdminButton>
                    </span>
                  )}
                  {r.status !== "PENDING" && (
                    <AdminButton size="sm" variant="ghost" disabled={mark.isPending} onClick={() => mark.mutate({ id: r.id, status: "PENDING" })}>Reopen</AdminButton>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      )}
      {data && data.pagination.totalPages > 1 && (
        <div className="mt-3 flex justify-end gap-1">
          <AdminButton size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</AdminButton>
          <AdminButton size="sm" variant="secondary" disabled={page >= data.pagination.totalPages} onClick={() => setPage(page + 1)}>Next</AdminButton>
        </div>
      )}
    </>
  );
}
