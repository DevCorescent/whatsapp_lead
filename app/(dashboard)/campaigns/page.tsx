"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Megaphone,
  Plus,
  Play,
  Copy,
  Trash2,
  Users,
  CalendarClock,
  Info,
  Ban,
  RotateCw,
  Send,
  Loader2,
  CheckCircle2,
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
import { useTemplates } from "@/hooks/useTemplates";

// Every CampaignStatus needs a style so the badge never renders "undefined".
// PROCESSING/SENT/CANCELLED are the scheduling statuses; the last three are
// legacy values kept for older campaigns.
const STATUS_STYLE: Record<CampaignStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600 ring-slate-500/20",
  SCHEDULED: "bg-sky-50 text-sky-700 ring-sky-600/20",
  PROCESSING: "bg-amber-50 text-amber-800 ring-amber-600/20",
  SENT: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  CANCELLED: "bg-slate-100 text-slate-500 ring-slate-400/20",
  FAILED: "bg-rose-50 text-rose-700 ring-rose-600/20",
  RUNNING: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  COMPLETED: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  PAUSED: "bg-amber-50 text-amber-800 ring-amber-600/20",
};

const STATUS_LABEL: Partial<Record<CampaignStatus, string>> = {
  PROCESSING: "Processing",
  SENT: "Sent",
  CANCELLED: "Cancelled",
};

const TABS: { key: "ALL" | CampaignStatus; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "DRAFT", label: "Drafts" },
  { key: "SCHEDULED", label: "Scheduled" },
  { key: "PROCESSING", label: "Processing" },
  { key: "SENT", label: "Sent" },
  { key: "FAILED", label: "Failed" },
  { key: "CANCELLED", label: "Cancelled" },
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
  const [scheduleFor, setScheduleFor] = useState<Campaign | null>(null);
  const { data, isLoading, isError } = useCampaigns(tab);

  const campaigns = useMemo(() => data ?? [], [data]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["campaigns"] });

  const action = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Action failed");
      return json;
    },
    onSuccess: invalidate,
    onError: (err: Error) => alert(err.message),
  });

  const sendNow = (c: Campaign) => {
    if (!confirm(`Send campaign "${c.name}" now to ${c.totalCount} recipient(s)?`)) return;
    action.mutate({ id: c.id, body: { action: "send_now" } });
  };
  const cancel = (c: Campaign) => {
    if (!confirm(`Cancel scheduled campaign "${c.name}"?`)) return;
    action.mutate({ id: c.id, body: { action: "cancel" } });
  };
  const retry = (c: Campaign) => action.mutate({ id: c.id, body: { action: "retry" } });

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
                  <th className="px-4 py-3 font-medium">Schedule / Sent</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{c.name}</p>
                      {c.lastError && c.status === "FAILED" && (
                        <p className="mt-0.5 max-w-xs truncate text-xs text-rose-500" title={c.lastError}>
                          {c.lastError}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={STATUS_STYLE[c.status]}>
                        {STATUS_LABEL[c.status] ?? c.status}
                      </Badge>
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
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">
                      {c.sentAt ? (
                        <span className="flex items-center gap-1 text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" />
                          {formatDate(c.sentAt)}
                        </span>
                      ) : c.scheduledAt ? (
                        <span className="flex items-center gap-1 text-sky-600">
                          <CalendarClock className="h-3 w-3" />
                          {formatDate(c.scheduledAt)}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {c.status === "PROCESSING" && (
                          <span className="flex items-center gap-1 px-2 text-xs text-amber-600">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Sending
                          </span>
                        )}

                        {(c.status === "DRAFT" ||
                          c.status === "SCHEDULED" ||
                          c.status === "CANCELLED") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Send now"
                            title="Send now"
                            disabled={action.isPending}
                            onClick={() => sendNow(c)}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        )}

                        {(c.status === "DRAFT" ||
                          c.status === "SCHEDULED" ||
                          c.status === "CANCELLED") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={c.status === "SCHEDULED" ? "Reschedule" : "Schedule"}
                            title={c.status === "SCHEDULED" ? "Reschedule" : "Schedule"}
                            disabled={action.isPending}
                            onClick={() => setScheduleFor(c)}
                          >
                            <CalendarClock className="h-4 w-4" />
                          </Button>
                        )}

                        {c.status === "SCHEDULED" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Cancel"
                            title="Cancel schedule"
                            className="text-amber-600 hover:bg-amber-50"
                            disabled={action.isPending}
                            onClick={() => cancel(c)}
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                        )}

                        {c.status === "FAILED" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Retry"
                            title="Retry failed sends"
                            disabled={action.isPending}
                            onClick={() => retry(c)}
                          >
                            <RotateCw className="h-4 w-4" />
                          </Button>
                        )}

                        <Button variant="ghost" size="sm" aria-label="Duplicate campaign" title="Duplicate">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Delete campaign"
                          title="Delete"
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
      <ScheduleModal campaign={scheduleFor} onClose={() => setScheduleFor(null)} onDone={invalidate} />
    </div>
  );
}

/** Shared minimum for datetime-local inputs: one minute into the future, local time. */
function minLocalDateTime(): string {
  const d = new Date(Date.now() + 60_000);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}

function CreateCampaignModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState("all");
  const [schedule, setSchedule] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Only APPROVED templates may be used in a campaign; unapproved ones are hidden.
  const { data: approvedTemplates } = useTemplates("APPROVED");
  const templates = approvedTemplates ?? [];

  const create = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
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
      setName(""); setMessage(""); setAudience("all"); setSchedule(""); setTemplateId(""); setError(null);
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  // Selecting an approved template pre-fills the message with its body.
  const onSelectTemplate = (id: string) => {
    setTemplateId(id);
    const t = templates.find((tpl) => tpl.id === id);
    if (t) setMessage(t.body);
  };

  // Submit as one of three intents. `intent` is set by the button pressed.
  const submit = (intent: "draft" | "send" | "schedule") => {
    const base = { name, message, all: audience === "all", ...(templateId && { templateId }) };
    if (intent === "schedule") {
      if (!schedule) { setError("Pick a date and time to schedule."); return; }
      create.mutate({ ...base, scheduledAt: new Date(schedule).toISOString() });
    } else if (intent === "send") {
      create.mutate({ ...base, sendNow: true });
    } else {
      create.mutate(base);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Campaign"
      description="Save it as a draft, schedule it, or send it right away."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit(schedule ? "schedule" : "send");
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

        <Field label="Approved template (optional)" htmlFor="campaign-template">
          {templates.length > 0 ? (
            <select
              id="campaign-template"
              value={templateId}
              onChange={(e) => onSelectTemplate(e.target.value)}
              className={inputClass}
            >
              <option value="">No template — write a custom message</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.language})
                </option>
              ))}
            </select>
          ) : (
            <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              <Info className="mt-px h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>
                No approved templates yet. Create one under{" "}
                <a href="/templates" className="font-medium text-emerald-700 hover:underline">
                  Templates
                </a>{" "}
                and submit it to Meta — approved templates will appear here.
              </span>
            </p>
          )}
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
              or{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-700">
                {"{{phone}}"}
              </code>{" "}
              to personalise each message.
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
            min={minLocalDateTime()}
            onChange={(e) => setSchedule(e.target.value)}
            className={inputClass}
          />
          <p className="mt-1.5 text-xs text-slate-500">
            Set a time to schedule it, or leave empty to send now / save as draft.
          </p>
        </Field>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!name.trim() || !message.trim() || create.isPending}
            onClick={() => submit("draft")}
          >
            Save as Draft
          </Button>
          {schedule ? (
            <Button type="submit" disabled={!name.trim() || !message.trim() || create.isPending}>
              <CalendarClock className="h-4 w-4" />
              {create.isPending ? "Scheduling…" : "Schedule"}
            </Button>
          ) : (
            <Button type="submit" disabled={!name.trim() || !message.trim() || create.isPending}>
              <Send className="h-4 w-4" />
              {create.isPending ? "Sending…" : "Send Now"}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}

function ScheduleModal({
  campaign,
  onClose,
  onDone,
}: {
  campaign: Campaign | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [when, setWhen] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (!campaign) return;
      if (!when) throw new Error("Pick a date and time.");
      const isReschedule = campaign.status === "SCHEDULED";
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: isReschedule ? "reschedule" : "schedule",
          scheduledAt: new Date(when).toISOString(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to schedule");
    },
    onSuccess: () => {
      setWhen(""); setError(null);
      onDone();
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  const isReschedule = campaign?.status === "SCHEDULED";

  return (
    <Modal
      open={Boolean(campaign)}
      onClose={onClose}
      title={isReschedule ? "Reschedule Campaign" : "Schedule Campaign"}
      description={campaign ? `"${campaign.name}" will be sent automatically at the chosen time.` : ""}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Send at" htmlFor="reschedule-at" required>
          <input
            id="reschedule-at"
            type="datetime-local"
            value={when}
            min={minLocalDateTime()}
            onChange={(e) => setWhen(e.target.value)}
            className={inputClass}
          />
        </Field>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!when || save.isPending}>
            <CalendarClock className="h-4 w-4" />
            {save.isPending ? "Saving…" : isReschedule ? "Reschedule" : "Schedule"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
