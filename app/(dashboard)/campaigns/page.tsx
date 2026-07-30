"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Megaphone,
  Plus,
  Play,
  Pause,
  Copy,
  FileCheck2,
  Loader2,
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
  Skeleton,
  SkeletonRows,
  inputClass,
  selectClass,
} from "@/components/ui";
import { useApprovedTemplates, type MessageTemplateDTO } from "@/hooks/useTemplates";
import { cn, formatCompact, formatDate } from "@/lib/utils";


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

/** The list projection the campaigns API returns — `template` is joined for the name only. */
type CampaignRow = Campaign & { template?: { id: string; name: string } | null };

function useCampaigns(status: "ALL" | CampaignStatus) {
  return useQuery<CampaignRow[]>({
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

/** How many approved templates the summary panel shows before it stops listing them. */
const TEMPLATE_PREVIEW_LIMIT = 6;

/**
 * The approved templates this workspace can broadcast with.
 *
 * Read from the templates API for the *active workspace* and filtered to Meta's APPROVED state by
 * the server, because those are the only templates a business-initiated broadcast may use — showing
 * drafts or rejected ones here would offer a campaign that Meta refuses at send time. There is no
 * placeholder data behind this panel: when the workspace has no approved template it says so and
 * points at where templates are created.
 */
function ApprovedTemplatesPanel() {
  const { data, isLoading, isError, refetch } = useApprovedTemplates();
  const templates = data ?? [];

  return (
    <Card className="mb-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <FileCheck2 className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Approved templates</h2>
            <p className="text-xs text-slate-500">
              Only templates Meta has approved can be broadcast.
            </p>
          </div>
        </div>
        {!isLoading && !isError && templates.length > 0 && (
          <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">
            {templates.length} available
          </Badge>
        )}
      </div>

      <div className="mt-3">
        {isLoading ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1">
              Couldn&apos;t load templates for this workspace.
            </span>
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : templates.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
            No approved templates yet. Submit a template to Meta from{" "}
            <Link href="/settings" className="font-medium text-emerald-700 hover:underline">
              Settings
            </Link>{" "}
            — approved ones appear here automatically, and campaigns can use them straight away.
          </p>
        ) : (
          <>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {templates.slice(0, TEMPLATE_PREVIEW_LIMIT).map((template) => (
                <li
                  key={template.id}
                  className="min-w-0 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-inset ring-slate-200/70"
                >
                  <p className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-semibold text-slate-800">
                      {template.name}
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400">
                      {template.language}
                    </span>
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500">
                    {template.body}
                  </p>
                </li>
              ))}
            </ul>
            {templates.length > TEMPLATE_PREVIEW_LIMIT && (
              <p className="mt-2 text-xs text-slate-400">
                +{templates.length - TEMPLATE_PREVIEW_LIMIT} more available when you create a campaign.
              </p>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

export default function CampaignsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"ALL" | CampaignStatus>("ALL");
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError, refetch } = useCampaigns(tab);

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

  const deleteCampaign = async (id: string, name: string, status: CampaignStatus) => {
    if (status === "RUNNING") {
      alert("Pause the campaign before deleting it.");
      return;
    }
    if (!confirm(`Delete campaign "${name}"? This cannot be undone.`)) return;
    await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    invalidate();
  };

  const duplicateCampaign = async (id: string) => {
    const res = await fetch(`/api/campaigns/${id}/duplicate`, { method: "POST" });
    if (res.ok) invalidate();
  };

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Broadcast WhatsApp messages to a segment and track delivery in real time."
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Create Campaign
          </Button>
        }
      />

      <ApprovedTemplatesPanel />

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
        ) : isError ? (
          // Failure and emptiness are different facts and get different answers: one offers a
          // retry, the other offers the action that fills the page.
          <EmptyState
            icon={AlertCircle}
            title="Couldn't load campaigns"
            description="The campaigns service didn't respond. Your broadcasts are unaffected — this is only the list."
            action={
              <Button variant="secondary" onClick={() => void refetch()}>
                Try again
              </Button>
            }
          />
        ) : campaigns.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="No campaigns yet"
            description="Create your first broadcast to reach your contacts on WhatsApp."
            action={
              <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" />
                Create Campaign
              </Button>
            }
          />
        ) : (
          <div className="scrollbar-slim overflow-x-auto">
            <table className="w-full min-w-5xl text-left text-sm">
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
                      {c.template?.name && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                          <FileCheck2 className="h-3 w-3 text-emerald-600" />
                          {c.template.name}
                        </p>
                      )}
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
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Duplicate campaign"
                          onClick={() => duplicateCampaign(c.id)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Delete campaign"
                          className="text-rose-600 hover:bg-rose-50"
                          onClick={() => deleteCampaign(c.id, c.name, c.status)}
                          disabled={c.status === "RUNNING"}
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

/** What POST /api/campaigns accepts. `templateId` records which approved template was used. */
interface CreateCampaignPayload {
  name: string;
  message: string;
  templateId?: string;
  all?: boolean;
  scheduledAt?: string;
}

function CreateCampaignModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [schedule, setSchedule] = useState("");
  const [error, setError] = useState<string | null>(null);

  const {
    data: templateData,
    isLoading: templatesLoading,
    isError: templatesError,
    refetch: refetchTemplates,
  } = useApprovedTemplates();
  const templates = templateData ?? [];

  const selectedTemplate: MessageTemplateDTO | null =
    templates.find((t) => t.id === templateId) ?? null;

  /**
   * Choosing a template takes over the message body.
   *
   * The body has to be the approved copy, character for character — that is what Meta signed off
   * on, and editing it is what turns an approved broadcast into a rejected one. So the textarea
   * becomes read-only and shows the template's body, and `templateId` travels with the campaign so
   * the send is attributable to that approval. Clearing the selection hands the composer back.
   */
  const chooseTemplate = (nextId: string) => {
    setTemplateId(nextId);
    const template = templates.find((t) => t.id === nextId);
    setMessage(template ? template.body : "");
  };

  const reset = () => {
    setName("");
    setMessage("");
    setTemplateId("");
    setSchedule("");
    setError(null);
  };

  const create = useMutation({
    mutationFn: async (data: CreateCampaignPayload) => {
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
      reset();
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
          // `datetime-local` yields a wall-clock string with no zone; the API compares against a
          // real instant, so it is converted here rather than shipped ambiguous.
          const when = schedule ? new Date(schedule) : null;
          create.mutate({
            name,
            message,
            // Every campaign goes to the workspace's whole contact list; the API supports an
            // explicit `contactIds` audience, which no screen builds yet.
            all: true,
            ...(templateId && { templateId }),
            ...(when && !Number.isNaN(when.getTime()) && { scheduledAt: when.toISOString() }),
          });
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

        <Field label="WhatsApp template" htmlFor="campaign-template">
          {templatesLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : templatesError ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1">Couldn&apos;t load approved templates.</span>
              <Button type="button" variant="secondary" size="sm" onClick={() => void refetchTemplates()}>
                Retry
              </Button>
            </div>
          ) : (
            <select
              id="campaign-template"
              value={templateId}
              onChange={(e) => chooseTemplate(e.target.value)}
              className={selectClass}
            >
              <option value="">
                {templates.length === 0
                  ? "No approved templates — write a custom message"
                  : "Custom message (no template)"}
              </option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} · {template.category} · {template.language}
                </option>
              ))}
            </select>
          )}
          <p className="mt-1.5 flex items-start gap-1.5 text-xs text-slate-500">
            <FileCheck2 className="mt-px h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span>
              {templates.length === 0
                ? "Only templates Meta has approved can be listed here. Submit one to broadcast within Meta's rules."
                : "Approved templates only. Meta rejects a business-initiated broadcast that isn't one."}
            </span>
          </p>
        </Field>

        <Field label="Message" htmlFor="campaign-message" required>
          <textarea
            id="campaign-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            readOnly={Boolean(selectedTemplate)}
            rows={5}
            className={cn(
              inputClass,
              "resize-y",
              selectedTemplate && "bg-slate-50 text-slate-600",
            )}
            placeholder={"Hi {{name}}, we're running 30% off this week…"}
          />
          {selectedTemplate ? (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs text-slate-500">
              <Info className="mt-px h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>
                This is the approved body of{" "}
                <strong className="font-medium text-slate-700">{selectedTemplate.name}</strong> and
                cannot be edited.
                {(selectedTemplate.variables?.length ?? 0) > 0 && (
                  <> Variables: {selectedTemplate.variables.map((v) => `{{${v}}}`).join(", ")}.</>
                )}
              </span>
            </p>
          ) : (
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
          )}
        </Field>

        <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          Sends to every contact in this workspace.
        </div>

        <Field label="Schedule" htmlFor="campaign-schedule">
          <input
            id="campaign-schedule"
            type="datetime-local"
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            className={inputClass}
          />
          <p className="mt-1.5 text-xs text-slate-500">
            Leave empty to send immediately.
          </p>
        </Field>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || !message.trim() || create.isPending}>
            {create.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
            ) : (
              "Create Campaign"
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
