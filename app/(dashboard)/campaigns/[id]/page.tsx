"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, Megaphone, Users } from "lucide-react";
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type RecipientStatus = "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED";

interface Recipient {
  id: string;
  phone: string;
  status: RecipientStatus;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  repliedAt: string | null;
  failedReason: string | null;
  contact: { id: string; name: string | null; phone: string } | null;
}

interface CampaignDetail {
  id: string;
  name: string;
  status: string;
  templateId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  totalCount: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  repliedCount: number;
  failedCount: number;
  metadata: unknown;
  createdAt: string;
}

// ─── Style maps ───────────────────────────────────────────────────────────────

const CAMPAIGN_STATUS_STYLE: Record<string, string> = {
  DRAFT:      "bg-slate-100 text-slate-600 ring-slate-500/20",
  SCHEDULED:  "bg-sky-50 text-sky-700 ring-sky-600/20",
  RUNNING:    "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  PROCESSING: "bg-blue-50 text-blue-700 ring-blue-600/20",
  COMPLETED:  "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  SENT:       "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  FAILED:     "bg-rose-50 text-rose-700 ring-rose-600/20",
  PAUSED:     "bg-amber-50 text-amber-800 ring-amber-600/20",
  CANCELLED:  "bg-slate-100 text-slate-500 ring-slate-400/20",
};

const RECIPIENT_STATUS_STYLE: Record<RecipientStatus, string> = {
  READ:      "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  DELIVERED: "bg-blue-50 text-blue-700 ring-blue-600/20",
  SENT:      "bg-slate-100 text-slate-600 ring-slate-500/20",
  FAILED:    "bg-rose-50 text-rose-700 ring-rose-600/20",
  PENDING:   "bg-amber-50 text-amber-700 ring-amber-600/20",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pctLabel(value: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function exportCsv(recipients: Recipient[], campaignName: string) {
  const headers = ["Name", "Phone", "Sent At", "Delivered At", "Read At", "Status", "Fail Reason"];
  const rows = recipients.map((r) => [
    r.contact?.name?.trim() ?? "",
    r.phone,
    r.sentAt ? formatDate(r.sentAt) : "",
    r.deliveredAt ? formatDate(r.deliveredAt) : "",
    r.readAt ? formatDate(r.readAt) : "",
    r.status,
    r.failedReason ?? "",
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${campaignName.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-recipients.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  total,
  barColor,
}: {
  label: string;
  value: number;
  total: number;
  barColor: string;
}) {
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-900/5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value.toLocaleString()}</p>
      <p className="mt-0.5 text-xs tabular-nums text-slate-400">
        {pctLabel(value, total)}
      </p>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CampaignReportPage() {
  const { id } = useParams<{ id: string }>();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["campaign", id],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${id}`);
      if (!res.ok) throw new Error("Failed to load campaign");
      const json = await res.json();
      return json.data as { campaign: CampaignDetail; recipients: Recipient[] };
    },
    enabled: !!id,
  });

  const campaign = data?.campaign;
  const recipients = data?.recipients ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return recipients;
    return recipients.filter(
      (r) =>
        r.phone.toLowerCase().includes(q) ||
        (r.contact?.name ?? "").toLowerCase().includes(q),
    );
  }, [recipients, search]);

  // ── Skeleton ──────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div>
        <div className="mb-6 flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-7 w-52" />
          <Skeleton className="ml-auto h-6 w-20 rounded-md" />
        </div>
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  // ── Not found ─────────────────────────────────────────────────────────────

  if (!campaign) {
    return (
      <EmptyState
        icon={Megaphone}
        title="Campaign not found"
        description="This campaign doesn't exist or you don't have access to it."
        action={
          <Link href="/campaigns">
            <Button variant="secondary">
              <ArrowLeft className="h-4 w-4" />
              Back to campaigns
            </Button>
          </Link>
        }
      />
    );
  }

  const total = campaign.totalCount;

  return (
    <div>
      {/* Header */}
      <PageHeader
        title={campaign.name}
        description={`Created ${formatDate(campaign.createdAt)}`}
        action={
          <div className="flex items-center gap-2">
            <Badge
              className={
                CAMPAIGN_STATUS_STYLE[campaign.status] ??
                "bg-slate-100 text-slate-600 ring-slate-500/20"
              }
            >
              {campaign.status}
            </Badge>
            <Link href="/campaigns">
              <Button variant="secondary" size="sm">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </Link>
          </div>
        }
      />

      {/* Stats row */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Total"     value={total}                   total={total} barColor="bg-slate-400" />
        <StatCard label="Sent"      value={campaign.sentCount}      total={total} barColor="bg-blue-500" />
        <StatCard label="Delivered" value={campaign.deliveredCount} total={total} barColor="bg-emerald-500" />
        <StatCard label="Read"      value={campaign.readCount}      total={total} barColor="bg-violet-500" />
        <StatCard label="Failed"    value={campaign.failedCount}    total={total} barColor="bg-rose-500" />
      </div>

      {/* Recipients table */}
      <Card className="overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">
              {filtered.length.toLocaleString()} recipient{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or phone…"
              className="h-8 w-48 rounded-lg px-3 text-sm ring-1 ring-inset ring-slate-200 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500 sm:w-56"
            />
            {recipients.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => exportCsv(recipients, campaign.name)}
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
            )}
          </div>
        </div>

        {recipients.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No recipients yet"
            description="Recipients will appear here once the campaign starts sending."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No results"
            description="No recipients match your search."
          />
        ) : (
          <>
            {/* Mobile: stacked cards */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {filtered.map((r) => (
                <li key={r.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">
                        {r.contact?.name?.trim() || r.phone}
                      </p>
                      <p className="text-xs text-slate-500">{r.phone}</p>
                    </div>
                    <Badge
                      className={
                        RECIPIENT_STATUS_STYLE[r.status] ??
                        "bg-slate-100 text-slate-600 ring-slate-500/20"
                      }
                    >
                      {r.status}
                    </Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-500">
                    <div>
                      <p className="font-medium text-slate-600">Sent</p>
                      <p>{r.sentAt ? formatDate(r.sentAt) : "—"}</p>
                    </div>
                    <div>
                      <p className="font-medium text-slate-600">Delivered</p>
                      <p>{r.deliveredAt ? formatDate(r.deliveredAt) : "—"}</p>
                    </div>
                    <div>
                      <p className="font-medium text-slate-600">Read</p>
                      <p>{r.readAt ? formatDate(r.readAt) : "—"}</p>
                    </div>
                  </div>
                  {r.failedReason && (
                    <p className="mt-1 truncate text-xs text-rose-600">{r.failedReason}</p>
                  )}
                </li>
              ))}
            </ul>

            {/* Desktop: table */}
            <div className="scrollbar-slim hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Phone</th>
                    <th className="px-4 py-3 font-medium">Sent</th>
                    <th className="px-4 py-3 font-medium">Delivered</th>
                    <th className="px-4 py-3 font-medium">Read</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {r.contact?.name?.trim() || "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        {r.phone}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                        {r.sentAt ? formatDate(r.sentAt) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                        {r.deliveredAt ? formatDate(r.deliveredAt) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                        {r.readAt ? formatDate(r.readAt) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          className={
                            RECIPIENT_STATUS_STYLE[r.status] ??
                            "bg-slate-100 text-slate-600 ring-slate-500/20"
                          }
                        >
                          {r.status}
                        </Badge>
                        {r.failedReason && (
                          <p
                            className="mt-0.5 max-w-[200px] truncate text-[11px] text-rose-500"
                            title={r.failedReason}
                          >
                            {r.failedReason}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
