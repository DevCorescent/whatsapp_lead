"use client";

// A client's activity, as its reseller sees it: delivery numbers, a daily chart,
// conversations and campaign results. Counts only — no contacts or message text
// (lib/clientReport.ts).

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card, SkeletonRows } from "@/components/ui";
import { MessagesOverTimeChart } from "@/components/analytics/Charts";
import { api, money, STATUS_TONE, Tile } from "@/components/reseller/shared";
import { cn, formatDate } from "@/lib/utils";

interface Report {
  days: number;
  messages: { sent: number; delivered: number; read: number; failed: number; received: number };
  daily: { date: string; sent: number; received: number }[];
  conversations: { started: number; open: number };
  contactsAdded: number;
  campaigns: {
    count: number;
    recent: { id: string; name: string; status: string; createdAt: string; total: number; sent: number; delivered: number; read: number; failed: number }[];
  };
  spentMinor: number;
}

const PERIODS = [7, 30, 90] as const;

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");

export function ClientReport({ clientId }: { clientId: string }) {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const report = useQuery({
    queryKey: ["reseller", "client", clientId, "report", days],
    queryFn: async () => (await api<{ data: Report }>(`/api/reseller/clients/${clientId}/report?days=${days}`)).data,
    placeholderData: (prev) => prev,
  });
  const r = report.data;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">Reports</h2>
          <p className="text-xs text-slate-500">Usage and delivery numbers. Their contacts and messages stay private.</p>
        </div>
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5" role="group" aria-label="Report period">
          {PERIODS.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={days === d}
              onClick={() => setDays(d)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition sm:py-1",
                days === d ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
              )}
            >
              {d} days
            </button>
          ))}
        </div>
      </div>

      {report.isLoading ? (
        <SkeletonRows rows={4} />
      ) : report.isError || !r ? (
        <Card className="p-5 text-sm text-rose-700">{(report.error as Error)?.message ?? "Couldn't load the report."}</Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Tile label="Sent" value={r.messages.sent.toLocaleString()} />
            <Tile label="Delivered" value={r.messages.delivered.toLocaleString()} hint={`${pct(r.messages.delivered, r.messages.sent)} of sent`} />
            <Tile label="Read" value={r.messages.read.toLocaleString()} hint={`${pct(r.messages.read, r.messages.sent)} of sent`} />
            <Tile label="Failed" value={r.messages.failed.toLocaleString()} />
            <Tile label="Received" value={r.messages.received.toLocaleString()} />
            <Tile label="Spent" value={money(r.spentMinor)} hint="from wallet" />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Tile label="Conversations started" value={r.conversations.started.toLocaleString()} hint={`${r.conversations.open.toLocaleString()} open now`} />
            <Tile label="New contacts" value={r.contactsAdded.toLocaleString()} hint="count only" />
            <Tile label="Campaigns" value={r.campaigns.count.toLocaleString()} />
          </div>

          <MessagesOverTimeChart data={r.daily.map((d) => ({ ...d, date: formatDate(d.date) }))} />

          <Card className="overflow-hidden">
            <h3 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-900">Recent campaigns</h3>
            {r.campaigns.recent.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">No campaigns in the last {r.days} days.</p>
            ) : (
              <div className="scrollbar-slim overflow-x-auto">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Campaign</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                      <th className="px-4 py-2.5 text-right font-medium">Recipients</th>
                      <th className="px-4 py-2.5 text-right font-medium">Delivered</th>
                      <th className="px-4 py-2.5 text-right font-medium">Read</th>
                      <th className="px-4 py-2.5 text-right font-medium">Failed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {r.campaigns.recent.map((c) => (
                      <tr key={c.id}>
                        <td className="px-4 py-2.5">
                          <span className="block font-medium text-slate-800">{c.name}</span>
                          <span className="block text-xs text-slate-500">{formatDate(c.createdAt)}</span>
                        </td>
                        <td className="px-4 py-2.5"><Badge className={STATUS_TONE[c.status] ?? ""}>{c.status}</Badge></td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{c.total.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{c.delivered.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{c.read.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{c.failed.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </section>
  );
}
