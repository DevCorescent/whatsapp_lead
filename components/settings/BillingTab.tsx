"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Download, Receipt, Sparkles } from "lucide-react";
import { Badge, Button, Card, EmptyState, Skeleton } from "@/components/ui";
import { cn, formatCompact, formatCurrency, formatDate } from "@/lib/utils";

// TODO [SHALMON]: GET /api/billing — plan, usage counters and invoice history (currently 501).

type Usage = { label: string; used: number; limit: number };

type Billing = {
  planName: string;
  priceMonthly: number;
  renewsAt: string | null;
  usage: { contacts: Usage; messages: Usage; agents: Usage };
  invoices: { id: string; number: string; date: string; amount: number; status: string }[];
};

function useBilling() {
  return useQuery<Billing>({
    queryKey: ["billing"],
    queryFn: async () => {
      const res = await fetch("/api/billing");
      if (!res.ok) throw new Error(`Failed to load billing (${res.status})`);
      return res.json();
    },
    retry: false,
  });
}

function UsageBar({ label, used, limit }: Usage) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="tabular-nums text-slate-500">
          {formatCompact(used)} / {limit > 0 ? formatCompact(limit) : "Unlimited"}
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const EMPTY_USAGE: Billing["usage"] = {
  contacts: { label: "Contacts", used: 0, limit: 0 },
  messages: { label: "Messages this month", used: 0, limit: 0 },
  agents: { label: "Agents", used: 0, limit: 0 },
};

export function BillingTab() {
  const { data, isLoading, isError } = useBilling();

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Card className="p-5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="mt-4 h-2 w-full" />
          <Skeleton className="mt-4 h-2 w-full" />
          <Skeleton className="mt-4 h-2 w-full" />
        </Card>
        <Card className="p-5">
          <Skeleton className="h-24 w-full" />
        </Card>
      </div>
    );
  }

  const usage = data?.usage ?? EMPTY_USAGE;
  const invoices = data?.invoices ?? [];

  return (
    <div className="space-y-5">
      {/* Current plan */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">
                {data?.planName ?? "No active plan"}
              </h2>
              <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">
                <Sparkles className="mr-1 h-3 w-3" />
                Current plan
              </Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {data ? (
                <>
                  <span className="font-semibold text-slate-900">
                    {formatCurrency(data.priceMonthly)}
                  </span>{" "}
                  / month
                  {data.renewsAt && <> · renews {formatDate(data.renewsAt)}</>}
                </>
              ) : (
                "Plan and usage details will appear once billing is connected."
              )}
            </p>
          </div>
          <Button>
            <ArrowUpRight className="h-4 w-4" />
            Upgrade Plan
          </Button>
        </div>

        <div className="mt-6 space-y-4 border-t border-slate-100 pt-5">
          <UsageBar {...usage.contacts} />
          <UsageBar {...usage.messages} />
          <UsageBar {...usage.agents} />
        </div>
      </Card>

      {/* Invoices */}
      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Invoice history</h2>
          <p className="mt-0.5 text-sm text-slate-500">Every payment made on this workspace.</p>
        </div>

        {isError || invoices.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={isError ? "Billing isn't available yet" : "No invoices yet"}
            description={
              isError
                ? "The billing API is still being built. Your plan usage and paid invoices will show up here once it's live."
                : "Invoices appear here after your first payment."
            }
          />
        ) : (
          <div className="scrollbar-slim overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Invoice</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Amount</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 text-right font-medium">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-mono text-xs text-slate-700">{inv.number}</td>
                    <td className="px-5 py-3 text-slate-600">{formatDate(inv.date)}</td>
                    <td className="px-5 py-3 tabular-nums text-slate-900">
                      {formatCurrency(inv.amount)}
                    </td>
                    <td className="px-5 py-3">
                      <Badge
                        className={
                          inv.status === "PAID"
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                            : "bg-amber-50 text-amber-800 ring-amber-600/20"
                        }
                      >
                        {inv.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button variant="ghost" size="sm">
                        <Download className="h-4 w-4" />
                        PDF
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
