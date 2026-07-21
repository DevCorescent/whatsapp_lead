"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Megaphone,
  Plus,
  Play,
  Pause,
  Copy,
  Trash2,
  Users,
  CalendarClock,
  Info,
} from "lucide-react";
import type { Campaign, CampaignStatus } from "@prisma/client";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  SkeletonRows,
  inputClass,
} from "@/components/ui";
import { cn, formatCompact, formatDate } from "@/lib/utils";
import { ExportButton } from "@/components/ExportButton";


const STATUS_STYLE: Record<CampaignStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600 ring-slate-500/20",
  SCHEDULED: "bg-sky-50 text-sky-700 ring-sky-600/20",
  RUNNING: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  COMPLETED: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  FAILED: "bg-rose-50 text-rose-700 ring-rose-600/20",
  PAUSED: "bg-amber-50 text-amber-800 ring-amber-600/20",
};

const TABS: { key: "ALL" | CampaignStatus; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "DRAFT", label: "Drafts" },
  { key: "SCHEDULED", label: "Scheduled" },
  { key: "RUNNING", label: "Running" },
  { key: "COMPLETED", label: "Completed" },
  { key: "PAUSED", label: "Paused" },
  { key: "FAILED", label: "Failed" },
];

const AUDIENCES = [
  { value: "all", label: "All contacts" },
  { value: "tag:vip", label: "Tag — VIP customers" },
  { value: "tag:new", label: "Tag — New signups" },
  { value: "stage:qualified", label: "Lead stage — Qualified" },
  { value: "score:hot", label: "Lead score — Hot" },
];

function useCampaigns(status: "ALL" | CampaignStatus) {
  return useQuery<Campaign[]>({
    queryKey: ["campaigns", status],
    queryFn: async () => {
      const qs = status === "ALL" ? "" : `?status=${status}`;
      const res = await fetch(`/api/campaigns${qs}`);
      if (!res.ok) throw new Error(`Failed to load campaigns (${res.status})`);
      const json = await res.json();
      return Array.isArray(json) ? json : (json.data ?? []);
    },
    retry: false,
  });
}

/** Thin delivery-rate meter shown under the Delivered column. */
function RateBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="min-w-24">
      <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
        <span className="tabular-nums">{formatCompact(value)}</span>
        <span className="tabular-nums text-slate-400">{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn(
            "h-full rounded-full",
            pct >= 80 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-rose-500",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function CampaignsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"ALL" | CampaignStatus>("ALL");
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useCampaigns(tab);

  const campaigns = useMemo(() => data ?? [], [data]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["campaigns"] });

  const toggleStatus = async (id: string, current: CampaignStatus) => {
    const status = current === "RUNNING" ? "PAUSED" : "RUNNING";
    await fetch(`/api/campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    invalidate();
  };

  const deleteCampaign = async (id: string, name: string) => {
    if (!confirm(`Delete campaign "${name}"? This cannot be undone.`)) return;
    await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    invalidate();
  };

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Broadcast WhatsApp messages to a segment and track delivery in real time."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportButton resource="campaigns" />
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Create Campaign
            </Button>
          </div>
        }
      />

      {/* Status filter tabs */}
      <div className="scrollbar-slim mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition",
              tab === t.key
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-4">
            <SkeletonRows rows={6} />
          </div>
        ) : isError || campaigns.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title={isError ? "Campaigns aren't available yet" : "No campaigns yet"}
            description={
              isError
                ? "The campaigns API is still being built. Once it's live, your broadcasts and their delivery stats will show up here."
                : "Create your first broadcast to reach a segment of contacts on WhatsApp."
            }
            action={
              <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" />
                Create Campaign
              </Button>
            }
          />
        ) : (
          <div className="scrollbar-slim overflow-x-auto">
            <table className="w-full min-w-[64rem] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Campaign</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Recipients</th>
                  <th className="px-4 py-3 font-medium">Sent</th>
                  <th className="px-4 py-3 font-medium">Delivered</th>
                  <th className="px-4 py-3 font-medium">Read</th>
                  <th className="px-4 py-3 font-medium">Replied</th>
                  <th className="px-4 py-3 font-medium">Failed</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{c.name}</p>
                      {c.scheduledAt && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                          <CalendarClock className="h-3 w-3" />
                          {formatDate(c.scheduledAt)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={STATUS_STYLE[c.status]}>{c.status}</Badge>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">
                      {formatCompact(c.totalCount)}
                    </td>
                    <td className="px-4 py-3">
                      <RateBar value={c.sentCount} total={c.totalCount} />
                    </td>
                    <td className="px-4 py-3">
                      <RateBar value={c.deliveredCount} total={c.totalCount} />
                    </td>
                    <td className="px-4 py-3">
                      <RateBar value={c.readCount} total={c.totalCount} />
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">
                      {formatCompact(c.repliedCount)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-rose-600">
                      {formatCompact(c.failedCount)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                      {formatDate(c.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={c.status === "RUNNING" ? "Pause campaign" : "Launch campaign"}
                          onClick={() => toggleStatus(c.id, c.status)}
                          disabled={c.status === "COMPLETED" || c.status === "FAILED"}
                        >
                          {c.status === "RUNNING" ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                        <Button variant="ghost" size="sm" aria-label="Duplicate campaign">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Delete campaign"
                          className="text-rose-600 hover:bg-rose-50"
                          onClick={() => deleteCampaign(c.id, c.name)}
                          disabled={c.status !== "DRAFT"}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CreateCampaignModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function CreateCampaignModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState("all");
  const [schedule, setSchedule] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async (data: { name: string; message: string; all?: boolean }) => {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create campaign");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      setName(""); setMessage(""); setAudience("all"); setSchedule(""); setError(null);
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Campaign"
      description="Draft a broadcast now — you can schedule it or send it immediately."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ name, message, all: audience === "all" });
        }}
      >
        <Field label="Campaign name" htmlFor="campaign-name" required>
          <input
            id="campaign-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="Diwali offer — Growth plan"
          />
        </Field>

        <Field label="Message" htmlFor="campaign-message" required>
          <textarea
            id="campaign-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            className={cn(inputClass, "resize-y")}
            placeholder={"Hi {{name}}, we're running 30% off this week…"}
          />
          <p className="mt-1.5 flex items-start gap-1.5 text-xs text-slate-500">
            <Info className="mt-px h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span>
              Use{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-700">
                {"{{name}}"}
              </code>{" "}
              to personalise each message. Other variables:{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-700">
                {"{{company}}"}
              </code>{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-700">
                {"{{phone}}"}
              </code>
            </span>
          </p>
        </Field>

        <Field label="Audience" htmlFor="campaign-audience">
          <select
            id="campaign-audience"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            className={inputClass}
          >
            {AUDIENCES.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
            <Users className="h-3.5 w-3.5 text-slate-400" />
            Segment builder coming soon — for now the whole segment is used.
          </p>
        </Field>

        <Field label="Schedule" htmlFor="campaign-schedule">
          <input
            id="campaign-schedule"
            type="datetime-local"
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            className={inputClass}
          />
          <p className="mt-1.5 text-xs text-slate-500">Leave empty to save as a draft.</p>
        </Field>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || !message.trim() || create.isPending}>
            {create.isPending ? "Creating…" : "Create Campaign"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
