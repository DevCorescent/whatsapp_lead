"use client";

import Link from "next/link";
import {
  CreditCard,
  ArrowUpRight,
  Download,
  Receipt,
  ExternalLink,
  Ban,
  RotateCw,
  AlertTriangle,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
} from "@/components/ui";
import { cn, formatCompact, formatCurrency, formatDate } from "@/lib/utils";
import {
  useBilling,
  useBillingPortal,
  useCancelSubscription,
  useResumeSubscription,
  type UsageMetric,
} from "@/hooks/useBilling";

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  TRIALING: "bg-sky-50 text-sky-700 ring-sky-600/20",
  PAST_DUE: "bg-amber-50 text-amber-800 ring-amber-600/20",
  CANCELLED: "bg-rose-50 text-rose-700 ring-rose-600/20",
  EXPIRED: "bg-slate-100 text-slate-500 ring-slate-400/20",
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  TRIALING: "Trial",
  PAST_DUE: "Past due",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

function UsageCard({ metric }: { metric: UsageMetric }) {
  const unlimited = metric.limit <= 0;
  const pct = unlimited ? 0 : Math.min(100, Math.round((metric.used / metric.limit) * 100));
  const tone = pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <Card className="p-4">
      <p className="text-sm font-medium text-slate-700">{metric.label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">
        {formatCompact(metric.used)}
        <span className="text-sm font-normal text-slate-400">
          {" "}/ {unlimited ? "Unlimited" : formatCompact(metric.limit)}
        </span>
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={cn("h-full rounded-full transition-all", unlimited ? "bg-slate-200" : tone)} style={{ width: `${pct}%` }} />
      </div>
    </Card>
  );
}

export default function BillingPage() {
  const { data, isLoading, isError } = useBilling();
  const portal = useBillingPortal();
  const cancel = useCancelSubscription();
  const resume = useResumeSubscription();

  const openPortal = async () => {
    try {
      const res = await portal.mutateAsync();
      if (res?.url) window.location.assign(res.url);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const run = (p: Promise<unknown>) => p.catch((e: Error) => alert(e.message));

  return (
    <div>
      <PageHeader
        title="Billing"
        description="Your plan, usage and payment history."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {data?.hasStripe && (
              <Button variant="secondary" onClick={openPortal} disabled={portal.isPending}>
                <ExternalLink className="h-4 w-4" />
                Billing portal
              </Button>
            )}
            <Link href="/billing/plans">
              <Button>
                <ArrowUpRight className="h-4 w-4" />
                Change plan
              </Button>
            </Link>
          </div>
        }
      />

      {isLoading ? (
        <div className="space-y-5">
          <Card className="p-5"><Skeleton className="h-20 w-full" /></Card>
          <Card className="p-5"><Skeleton className="h-24 w-full" /></Card>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Current plan */}
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-slate-400" />
                  <h2 className="text-lg font-semibold text-slate-900">{data?.planName ?? "No plan"}</h2>
                  {data && (
                    <Badge className={STATUS_STYLE[data.status] ?? STATUS_STYLE.EXPIRED}>
                      {STATUS_LABEL[data.status] ?? data.status}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  <span className="font-semibold text-slate-900">{formatCurrency(data?.priceMonthly ?? 0)}</span> / month
                  {data?.cancelAtPeriodEnd && data.renewsAt ? (
                    <> · cancels on {formatDate(data.renewsAt)}</>
                  ) : data?.renewsAt ? (
                    <> · renews {formatDate(data.renewsAt)}</>
                  ) : null}
                  {data?.trialEndsAt && <> · trial ends {formatDate(data.trialEndsAt)}</>}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {data?.cancelAtPeriodEnd ? (
                  <Button variant="secondary" onClick={() => run(resume.mutateAsync())} disabled={resume.isPending}>
                    <RotateCw className="h-4 w-4" />
                    Resume
                  </Button>
                ) : (
                  data?.status !== "CANCELLED" && (
                    <Button
                      variant="ghost"
                      className="text-rose-600 hover:bg-rose-50"
                      onClick={() => { if (confirm("Cancel your subscription at the end of the current period?")) run(cancel.mutateAsync()); }}
                      disabled={cancel.isPending}
                    >
                      <Ban className="h-4 w-4" />
                      Cancel
                    </Button>
                  )
                )}
              </div>
            </div>

            {data?.status === "PAST_DUE" && (
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Your last payment failed. Update your payment method in the billing portal to keep your plan active.
              </div>
            )}
          </Card>

          {/* Usage cards */}
          {data && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <UsageCard metric={data.usage.agents} />
              <UsageCard metric={data.usage.contacts} />
              <UsageCard metric={data.usage.campaigns} />
              <UsageCard metric={data.usage.messages} />
              <UsageCard metric={data.usage.storage} />
              <UsageCard metric={data.usage.ai} />
            </div>
          )}

          {/* Invoices */}
          <Card className="overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="font-semibold text-slate-900">Payment history</h2>
              <p className="mt-0.5 text-sm text-slate-500">Invoices for this workspace.</p>
            </div>

            {isError || !data || data.invoices.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="No invoices yet"
                description="Paid invoices will appear here after your first payment."
              />
            ) : (
              <div className="scrollbar-slim overflow-x-auto">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3 font-medium">Invoice</th>
                      <th className="px-5 py-3 font-medium">Date</th>
                      <th className="px-5 py-3 font-medium">Amount</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 text-right font-medium">Download</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.invoices.map((inv) => {
                      const downloadUrl = inv.pdf ?? inv.url;
                      return (
                      <tr key={inv.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-mono text-xs text-slate-700">{inv.number}</td>
                        <td className="px-5 py-3 text-slate-600">{formatDate(inv.date)}</td>
                        <td className="px-5 py-3 tabular-nums text-slate-900">{formatCurrency(inv.amount)}</td>
                        <td className="px-5 py-3">
                          <Badge className={inv.status === "PAID" ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-amber-50 text-amber-800 ring-amber-600/20"}>
                            {inv.status}
                          </Badge>
                        </td>
                        <td className="px-5 py-3 text-right">
                          {downloadUrl ? (
                            <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
                              <Button variant="ghost" size="sm">
                                <Download className="h-4 w-4" />
                                PDF
                              </Button>
                            </a>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
