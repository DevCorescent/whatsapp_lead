"use client";

import { useEffect, useMemo, useState } from "react";
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
  Loader2,
  Info,
  AlertCircle,
  Eye,
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface TemplateRow {
  id: string;
  name: string;
  category: string;
  language: string;
  status: string;
  body: string;
  footer?: string | null;
  variables: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<CampaignStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600 ring-slate-500/20",
  SCHEDULED: "bg-sky-50 text-sky-700 ring-sky-600/20",
  RUNNING: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  PROCESSING: "bg-blue-50 text-blue-700 ring-blue-600/20",
  COMPLETED: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  SENT: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  FAILED: "bg-rose-50 text-rose-700 ring-rose-600/20",
  PAUSED: "bg-amber-50 text-amber-800 ring-amber-600/20",
  CANCELLED: "bg-slate-100 text-slate-500 ring-slate-400/20",
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

const CONTACT_FIELD_OPTIONS = [
  { value: "name", label: "Contact Name" },
  { value: "phone", label: "Contact Phone" },
  { value: "company", label: "Contact Company" },
];

// ─── Hooks ────────────────────────────────────────────────────────────────────

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

function useTemplates(enabled: boolean) {
  return useQuery<TemplateRow[]>({
    queryKey: ["templates"],
    queryFn: async () => {
      const res = await fetch("/api/templates");
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : (json.data ?? []);
    },
    enabled,
    staleTime: 60_000,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectBodyVarSlots(body: string): number {
  const matches = [...body.matchAll(/\{\{(\d+)\}\}/g)];
  const nums = matches.map((m) => parseInt(m[1], 10));
  return nums.length > 0 ? Math.max(...nums) : 0;
}

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"ALL" | CampaignStatus>("ALL");
  const [open, setOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading, isError } = useCampaigns(tab);
  const campaigns = useMemo(() => data ?? [], [data]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["campaigns"] });

  // ── Mutations ──

  const toggleMutation = useMutation({
    mutationFn: async ({ id, current }: { id: string; current: CampaignStatus }) => {
      const status = current === "RUNNING" ? "PAUSED" : "RUNNING";
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to update campaign");
      }
      return res.json();
    },
    onSuccess: () => invalidate(),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/campaigns/${id}/duplicate`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to duplicate");
      }
      return res.json();
    },
    onSuccess: () => invalidate(),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to delete campaign");
      }
      return res.json();
    },
    onSuccess: () => { invalidate(); setDeletingId(null); },
  });

  // Per-row pending helpers
  const isToggling = (id: string) =>
    toggleMutation.isPending && (toggleMutation.variables as { id: string } | undefined)?.id === id;
  const isDuplicating = (id: string) =>
    duplicateMutation.isPending && duplicateMutation.variables === id;

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Broadcast WhatsApp templates to a segment and track delivery in real time."
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Create Campaign
          </Button>
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
                : "Create your first broadcast to reach contacts on WhatsApp using an approved message template."
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
                {campaigns.map((c) => {
                  const toggling = isToggling(c.id);
                  const duplicating = isDuplicating(c.id);
                  return (
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
                        <RateBar value={c.deliveredCount ?? 0} total={c.totalCount} />
                      </td>
                      <td className="px-4 py-3">
                        <RateBar value={c.readCount ?? 0} total={c.totalCount} />
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">
                        {formatCompact(c.repliedCount ?? 0)}
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
                            onClick={() => toggleMutation.mutate({ id: c.id, current: c.status })}
                            disabled={toggling || c.status === "COMPLETED" || c.status === "FAILED" || c.status === "CANCELLED"}
                          >
                            {toggling ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : c.status === "RUNNING" ? (
                              <Pause className="h-4 w-4" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Duplicate campaign"
                            onClick={() => duplicateMutation.mutate(c.id)}
                            disabled={duplicating}
                          >
                            {duplicating ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Delete campaign"
                            className="text-rose-600 hover:bg-rose-50"
                            onClick={() => setDeletingId(c.id)}
                            disabled={c.status === "RUNNING"}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CreateCampaignModal open={open} onClose={() => setOpen(false)} />

      {/* Delete confirmation — proper modal, not browser confirm() */}
      <Modal
        open={!!deletingId}
        onClose={() => !deleteMutation.isPending && setDeletingId(null)}
        title="Delete campaign?"
        description="This permanently removes the campaign and all its recipient records. This cannot be undone."
      >
        {deleteMutation.isError && (
          <p className="mb-3 flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {(deleteMutation.error as Error).message}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="secondary"
            onClick={() => setDeletingId(null)}
            disabled={deleteMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={deleteMutation.isPending}
            onClick={() => deletingId && deleteMutation.mutate(deletingId)}
          >
            {deleteMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Deleting…
              </>
            ) : (
              "Delete campaign"
            )}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// ─── Create Campaign Modal ─────────────────────────────────────────────────────

function CreateCampaignModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [bodyVarMapping, setBodyVarMapping] = useState<string[]>([]);
  const [audience, setAudience] = useState("all");
  const [schedule, setSchedule] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: templatesData, isLoading: tplLoading } = useTemplates(open);
  const allTemplates = templatesData ?? [];
  const approvedTemplates = allTemplates.filter((t) => t.status === "APPROVED");
  const selectedTemplate = approvedTemplates.find((t) => t.id === templateId) ?? null;

  const varSlotCount = useMemo(
    () => (selectedTemplate ? detectBodyVarSlots(selectedTemplate.body) : 0),
    [selectedTemplate],
  );

  // Reset variable mapping whenever the selected template or slot count changes.
  useEffect(() => {
    setBodyVarMapping(Array.from({ length: varSlotCount }, () => "name"));
  }, [varSlotCount]);

  const create = useMutation({
    mutationFn: async (data: {
      name: string;
      templateId: string;
      bodyVarMapping: string[];
      all?: boolean;
      scheduledAt?: string;
    }) => {
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
      resetForm();
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  function resetForm() {
    setName("");
    setTemplateId("");
    setBodyVarMapping([]);
    setAudience("all");
    setSchedule("");
    setShowPreview(false);
    setError(null);
  }

  function handleClose() {
    if (create.isPending) return;
    resetForm();
    onClose();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const when = schedule ? new Date(schedule) : null;
    create.mutate({
      name,
      templateId,
      bodyVarMapping,
      all: audience === "all",
      ...(when && !Number.isNaN(when.getTime()) && { scheduledAt: when.toISOString() }),
    });
  }

  const canSubmit = name.trim() && templateId && !create.isPending;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Create Campaign"
      description="Pick an approved WhatsApp template, map contact fields to its variables, then schedule or send immediately."
    >
      <form className="space-y-4" onSubmit={submit}>
        {/* Campaign name */}
        <Field label="Campaign name" htmlFor="campaign-name" required>
          <input
            id="campaign-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="Diwali offer — Growth plan"
          />
        </Field>

        {/* Template picker */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="campaign-tpl">
            Template <span className="text-rose-500">*</span>
          </label>
          {tplLoading ? (
            <div className={cn(inputClass, "flex items-center gap-2 text-slate-400")}>
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading templates…
            </div>
          ) : approvedTemplates.length === 0 ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="text-xs text-amber-800">
                No approved templates found. WhatsApp only allows broadcast campaigns via pre-approved
                message templates.{" "}
                <a href="/templates" className="underline hover:text-amber-900">
                  Create and submit a template →
                </a>
              </div>
            </div>
          ) : (
            <select
              id="campaign-tpl"
              value={templateId}
              onChange={(e) => { setTemplateId(e.target.value); setShowPreview(false); }}
              className={inputClass}
            >
              <option value="">— Select a template —</option>
              {approvedTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  [{t.category}] {t.name} ({t.language})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Template preview toggle */}
        {selectedTemplate && (
          <div className="space-y-2">
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-900"
              onClick={() => setShowPreview((v) => !v)}
            >
              <Eye className="h-3.5 w-3.5" />
              {showPreview ? "Hide preview" : "Preview template"}
            </button>
            {showPreview && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Body
                </p>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{selectedTemplate.body}</p>
                {selectedTemplate.footer && (
                  <p className="mt-2 text-xs text-slate-400">{selectedTemplate.footer}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Variable mapping */}
        {varSlotCount > 0 && (
          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Variable mapping
            </span>
            <div className="space-y-2">
              {Array.from({ length: varSlotCount }, (_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-8 shrink-0 font-mono text-[11px] text-slate-500">
                    {`{{${i + 1}}}`}
                  </span>
                  <select
                    className={inputClass}
                    value={bodyVarMapping[i] ?? "name"}
                    onChange={(e) =>
                      setBodyVarMapping((prev) => {
                        const next = [...prev];
                        next[i] = e.target.value;
                        return next;
                      })
                    }
                  >
                    {CONTACT_FIELD_OPTIONS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-400">
              <Info className="h-3 w-3 shrink-0" />
              Each placeholder is filled with the chosen contact field at send time.
            </p>
          </div>
        )}

        {/* Audience */}
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

        {/* Schedule */}
        <Field label="Schedule" htmlFor="campaign-schedule">
          <input
            id="campaign-schedule"
            type="datetime-local"
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            className={inputClass}
          />
          <p className="mt-1.5 text-xs text-slate-500">Leave empty to send immediately.</p>
        </Field>

        {error && (
          <p className="flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={create.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {create.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              "Create Campaign"
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
