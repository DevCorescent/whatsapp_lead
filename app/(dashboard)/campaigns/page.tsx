"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  Send,
  Filter,
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
import { ExportButton } from "@/components/ExportButton";
import { HeaderMediaInput, type MediaHeaderType } from "@/components/campaigns/HeaderMediaInput";
import {
  ExcludedSummary,
  RecipientReview,
  type ExclusionReport,
} from "@/components/campaigns/RecipientReview";
import { cn, formatCompact, formatDate } from "@/lib/utils";
import {
  detectBodyVarSlots,
  extractBodyVarNames,
  dynamicUrlButtons,
  renderButtonUrl,
  unsupportedTemplateReason,
} from "@/lib/campaigns/templateVars";

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
  headerType?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | null;
  headerContent?: string | null;
  buttons?: unknown;
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
  { key: "PROCESSING", label: "Processing" },
  { key: "COMPLETED", label: "Completed" },
  { key: "SENT", label: "Sent" },
  { key: "PAUSED", label: "Paused" },
  { key: "FAILED", label: "Failed" },
];

const CONTACT_FIELD_OPTIONS = [
  { value: "name", label: "Contact Name" },
  { value: "phone", label: "Contact Phone" },
  { value: "company", label: "Contact Company" },
];

/** What the Create Campaign modal sends to POST /api/campaigns. */
interface CampaignPayload {
  name: string;
  templateId?: string;
  segmentId?: string;
  bodyVarMapping: string[];
  urlButtonMapping: string[];
  all?: boolean;
  contactIds?: string[];
  excludeContactIds?: string[];
  scheduledAt?: string;
  headerMediaId?: string;
  headerMediaUrl?: string;
}

interface PickerContact {
  id: string;
  name: string | null;
  phone: string;
  company?: string | null;
}

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

function useCampaignContacts(enabled: boolean, search: string) {
  return useQuery<PickerContact[]>({
    queryKey: ["campaign-contact-picker", search],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100" });
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/contacts?${params}`);
      if (!res.ok) throw new Error("Failed to load contacts");
      const json = await res.json();
      const list = Array.isArray(json) ? json : (json.data ?? []);
      return (list as PickerContact[]).filter((c) => c?.id && c?.phone);
    },
    enabled,
    staleTime: 30_000,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatInr = (minor: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(minor / 100);

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
  return (
    <Suspense>
      <CampaignsPageInner />
    </Suspense>
  );
}

function CampaignsPageInner() {
  const queryClient = useQueryClient();
  // Arriving from Segments → "Create campaign" (/campaigns?segment=<id>) opens the
  // create dialog with that segment as the audience.
  const initialSegmentId = useSearchParams().get("segment");
  const [tab, setTab] = useState<"ALL" | CampaignStatus>("ALL");
  const [open, setOpen] = useState(Boolean(initialSegmentId));
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

  // Row actions are shared by the desktop table and the phone card list.
  const renderActions = (c: Campaign) => {
    const toggling = isToggling(c.id);
    const duplicating = isDuplicating(c.id);
    return (
    <>
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
    </>
    );
  };

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Broadcast WhatsApp templates to a segment and track delivery in real time."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportButton resource="campaigns" />
            <Link
              href="/broadcast"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-3.5 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <Send className="h-4 w-4" />
              Bulk Broadcast
            </Link>
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
          <>
          {/* Phones: stacked cards instead of the 11-column table */}
          <ul className="divide-y divide-slate-100 md:hidden">
            {campaigns.map((c) => (
              <li key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{c.name}</p>
                    {c.scheduledAt ? (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                        <CalendarClock className="h-3 w-3" />
                        {formatDate(c.scheduledAt)}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs text-slate-500">{formatDate(c.createdAt)}</p>
                    )}
                  </div>
                  <Badge className={STATUS_STYLE[c.status]}>{c.status}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                  {(
                    [
                      ["Sent", c.sentCount],
                      ["Delivered", c.deliveredCount ?? 0],
                      ["Read", c.readCount ?? 0],
                      ["Clicked", c.clickedCount ?? 0],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label}>
                      <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
                      <RateBar value={value} total={c.totalCount} />
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-500">
                    <span className="tabular-nums text-slate-700">{formatCompact(c.totalCount)}</span> recipients ·{" "}
                    <span className="tabular-nums">{formatCompact(c.repliedCount ?? 0)}</span> replied ·{" "}
                    <span className="tabular-nums text-rose-600">{formatCompact(c.failedCount)}</span> failed
                  </p>
                  <div className="flex shrink-0 items-center gap-1 [&>button]:h-10 [&>button]:w-10">
                    {renderActions(c)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="scrollbar-slim hidden overflow-x-auto md:block">
            <table className="w-full min-w-5xl text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Campaign</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Recipients</th>
                  <th className="px-4 py-3 font-medium">Sent</th>
                  <th className="px-4 py-3 font-medium">Delivered</th>
                  <th className="px-4 py-3 font-medium">Read</th>
                  <th className="px-4 py-3 font-medium">Clicked</th>
                  <th className="px-4 py-3 font-medium">Replied</th>
                  <th className="px-4 py-3 font-medium">Failed</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaigns.map((c) => {
                  return (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="flex items-center gap-1.5 font-medium text-slate-900">
                          {c.name}
                        </p>
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
                      <td className="px-4 py-3">
                        <RateBar value={c.clickedCount ?? 0} total={c.totalCount} />
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
                        <div className="flex items-center justify-end gap-1">{renderActions(c)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>

      <CreateCampaignModal open={open} onClose={() => setOpen(false)} initialSegmentId={initialSegmentId} />

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
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>button]:h-10 [&>button]:w-full sm:[&>button]:h-9 sm:[&>button]:w-auto pt-2">
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

function CreateCampaignModal({
  open,
  onClose,
  initialSegmentId,
}: {
  open: boolean;
  onClose: () => void;
  initialSegmentId?: string | null;
}) {
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [bodyVarMapping, setBodyVarMapping] = useState<string[]>([]);
  // Dynamic URL buttons: a contact field ("name" / "phone" / "company") or literal text per link.
  const [urlSource, setUrlSource] = useState<string[]>([]);
  const [urlText, setUrlText] = useState<string[]>([]);
  const [audienceMode, setAudienceMode] = useState<"all" | "selected" | "segment">(initialSegmentId ? "segment" : "all");
  const [segmentId, setSegmentId] = useState(initialSegmentId ?? "");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [schedule, setSchedule] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [headerMediaUrl, setHeaderMediaUrl] = useState("");
  const [headerMediaId, setHeaderMediaId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: templatesData, isLoading: tplLoading } = useTemplates(open);
  const { data: contactsData, isLoading: contactsLoading } = useCampaignContacts(
    open && audienceMode === "selected",
    contactSearch,
  );
  const contacts = contactsData ?? [];
  const allTemplates = templatesData ?? [];
  const approvedTemplates = allTemplates.filter((t) => t.status === "APPROVED");
  const selectedTemplate = approvedTemplates.find((t) => t.id === templateId) ?? null;

  // Not wrapped in useMemo: the React Compiler memoizes this on its own, and a
  // hand-rolled memo here is exactly what it reports it cannot preserve — it
  // cannot prove a template row is never mutated, so the dependency is
  // unverifiable however it is spelled. Counting `{{n}}` slots in one string is
  // a regex scan, not work worth a memo.
  const { data: segmentsData, isLoading: segmentsLoading } = useQuery<{ id: string; name: string; count: number }[]>({
    queryKey: ["segments"],
    queryFn: async () => {
      const res = await fetch("/api/segments");
      if (!res.ok) return [];
      return (await res.json()).data ?? [];
    },
    enabled: open && audienceMode === "segment",
  });
  const segments = segmentsData ?? [];
  const chosenSegment = segments.find((s) => s.id === segmentId) ?? null;

  const selectedTemplateBody = selectedTemplate?.body ?? "";
  const varSlotCount = detectBodyVarSlots(selectedTemplateBody);
  const namedVarLabels = extractBodyVarNames(selectedTemplateBody);
  const urlButtons = selectedTemplate ? dynamicUrlButtons(selectedTemplate) : [];

  // The mapping is the user's to edit, so it is state rather than a derived
  // value — but it must start over when a different template is picked, since
  // slot 1 of one template means nothing in another. Re-seeded during render on
  // the template id, the way the team modal re-seeds: an effect would render one
  // frame of the previous template's mapping before correcting it.
  const [mappedTemplateId, setMappedTemplateId] = useState<string | null>(null);
  const selectedTemplateId = selectedTemplate?.id ?? null;
  if (selectedTemplateId !== mappedTemplateId) {
    setMappedTemplateId(selectedTemplateId);
    setBodyVarMapping(Array.from({ length: varSlotCount }, () => "name"));
    setUrlSource(urlButtons.map(() => "custom"));
    setUrlText(urlButtons.map(() => ""));
    setHeaderMediaUrl("");
    setHeaderMediaId("");
  }

  // Step 2: the server-resolved audience, reviewed before anything is created.
  const [reviewData, setReviewData] = useState<
    | (ExclusionReport & {
        total: number;
        recipients: { contactId: string; phone: string; name: string | null }[];
        cost?: { units: number; unitPriceMinor: number; estimatedCostMinor: number; balanceMinor: number };
      })
    | null
  >(null);
  const [reviewRemoved, setReviewRemoved] = useState<Set<string>>(new Set());

  const review = useMutation({
    mutationFn: async (data: CampaignPayload) => {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, dryRun: true, includeRecipients: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not check the recipients");
      return json.data;
    },
    onSuccess: (data) => {
      setReviewRemoved(new Set());
      setReviewData(data);
    },
    onError: (err: Error) => setError(err.message),
  });

  const create = useMutation({
    mutationFn: async (data: CampaignPayload) => {
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
    onError: (err: Error) => { setReviewData(null); setError(err.message); },
  });

  function resetForm() {
    setName("");
    setTemplateId("");
    setBodyVarMapping([]);
    setAudienceMode("all");
    setSegmentId("");
    setSelectedIds([]);
    setContactSearch("");
    setSchedule("");
    setShowPreview(false);
    setHeaderMediaUrl("");
    setHeaderMediaId("");
    setError(null);
    setReviewData(null);
    setReviewRemoved(new Set());
  }

  function handleClose() {
    if (create.isPending || review.isPending) return;
    resetForm();
    onClose();
  }

  function toggleContact(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleSelectAllVisible() {
    const visibleIds = contacts.map((c) => c.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (audienceMode === "selected" && selectedIds.length === 0) {
      setError("Select at least one contact, or choose Select all.");
      return;
    }
    if (audienceMode === "segment" && !segmentId) {
      setError("Choose a segment.");
      return;
    }

    review.mutate(basePayload());
  }

  function basePayload(): CampaignPayload {
    const when = schedule ? new Date(schedule) : null;
    return {
      name,
      templateId,
      bodyVarMapping,
      urlButtonMapping,
      ...(audienceMode === "all"
        ? { all: true }
        : audienceMode === "segment"
          ? { segmentId }
          : { contactIds: selectedIds }),
      ...(when && !Number.isNaN(when.getTime()) && { scheduledAt: when.toISOString() }),
      ...(headerMediaId && { headerMediaId }),
      ...(headerMediaUrl.trim() && !headerMediaId && { headerMediaUrl: headerMediaUrl.trim() }),
    };
  }

  /** Create with the reviewed audience: everyone minus the people removed on the review list. */
  function confirmCreate() {
    const removedIds = [...reviewRemoved];
    const base = basePayload();
    create.mutate(
      base.all || base.segmentId
        ? { ...base, ...(removedIds.length && { excludeContactIds: removedIds }) }
        : { ...base, contactIds: (base.contactIds ?? []).filter((id) => !reviewRemoved.has(id)) },
    );
  }

  const finalCount = reviewData ? reviewData.recipients.filter((r) => !reviewRemoved.has(r.contactId)).length : 0;

  const needsMediaUrl =
    selectedTemplate?.headerType === "IMAGE" ||
    selectedTemplate?.headerType === "VIDEO" ||
    selectedTemplate?.headerType === "DOCUMENT";

  const urlButtonMapping = urlSource.map((src, i) => (src === "custom" ? (urlText[i] ?? "").trim() : src));
  const missingUrl = urlSource.some((src, i) => src === "custom" && !(urlText[i] ?? "").trim());

  const canSubmit =
    !missingUrl &&
    name.trim() &&
    templateId &&
    !create.isPending &&
    (audienceMode === "all" || (audienceMode === "segment" ? Boolean(segmentId) : selectedIds.length > 0)) &&
    (!needsMediaUrl || headerMediaId || headerMediaUrl.trim());

  const allVisibleSelected =
    contacts.length > 0 && contacts.every((c) => selectedIds.includes(c.id));

  return (
    <>
    <Modal
      open={open && !reviewData}
      onClose={handleClose}
      title="Create Campaign"
      description="Pick an approved WhatsApp template, choose who gets it — everyone, a segment or selected contacts — then review and send."
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
              {approvedTemplates.map((t) => {
                const unsupported = unsupportedTemplateReason(t);
                return (
                  <option key={t.id} value={t.id} disabled={!!unsupported} title={unsupported ?? undefined}>
                    [{t.category}] {t.name} ({t.language}){unsupported ? " — not supported" : ""}
                  </option>
                );
              })}
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
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                {selectedTemplate.headerType && (
                  <div>
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      Header
                    </p>
                    {selectedTemplate.headerType === "TEXT" ? (
                      <p className="text-sm font-semibold text-slate-800">{selectedTemplate.headerContent}</p>
                    ) : (
                      <span className={cn(
                        "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium",
                        selectedTemplate.headerType === "IMAGE" && "bg-blue-50 text-blue-700",
                        selectedTemplate.headerType === "VIDEO" && "bg-purple-50 text-purple-700",
                        selectedTemplate.headerType === "DOCUMENT" && "bg-amber-50 text-amber-700",
                      )}>
                        {selectedTemplate.headerType === "IMAGE" && "🖼 Image"}
                        {selectedTemplate.headerType === "VIDEO" && "🎬 Video"}
                        {selectedTemplate.headerType === "DOCUMENT" && "📄 Document"}
                      </span>
                    )}
                  </div>
                )}
                <div>
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    Body
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-slate-700">{selectedTemplate.body}</p>
                </div>
                {selectedTemplate.footer && (
                  <p className="text-xs text-slate-400">{selectedTemplate.footer}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Media header — required when the template has an image/video/document header */}
        {needsMediaUrl && selectedTemplate?.headerType && (
          <HeaderMediaInput
            key={selectedTemplate.id}
            headerType={selectedTemplate.headerType as MediaHeaderType}
            value={{ mediaId: headerMediaId, mediaUrl: headerMediaUrl }}
            onChange={(v) => { setHeaderMediaId(v.mediaId); setHeaderMediaUrl(v.mediaUrl); }}
            onError={setError}
          />
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
                  <span className="w-24 shrink-0 font-mono text-[11px] text-slate-500">
                    {namedVarLabels.length > 0
                      ? `{{${namedVarLabels[i] ?? i + 1}}}`
                      : `{{${i + 1}}}`}
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

        {/* Dynamic URL buttons */}
        {urlButtons.length > 0 && (
          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Button links</span>
            <div className="space-y-3">
              {urlButtons.map((button, i) => (
                <div key={button.index}>
                  <p className="mb-1 break-all text-xs text-slate-500">
                    <span className="font-medium text-slate-700">“{button.text}”</span> opens{" "}
                    <span className="font-mono text-[11px]">{button.url}</span>
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select
                      className={cn(inputClass, "sm:w-48")}
                      value={urlSource[i] ?? "custom"}
                      onChange={(e) => setUrlSource((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                      aria-label={`Source for the ${button.text} link`}
                    >
                      <option value="custom">Custom text</option>
                      {CONTACT_FIELD_OPTIONS.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                    {(urlSource[i] ?? "custom") === "custom" && (
                      <input
                        className={inputClass}
                        value={urlText[i] ?? ""}
                        onChange={(e) => setUrlText((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                        placeholder="e.g. ABC123"
                        aria-label={`Link value for ${button.text}`}
                      />
                    )}
                  </div>
                  {(urlSource[i] ?? "custom") === "custom" && urlText[i]?.trim() && (
                    <p className="mt-1 break-all text-[11px] text-slate-400">
                      Link: {renderButtonUrl(button.url, encodeURIComponent(urlText[i].trim()))}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Audience */}
        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Audience</span>
          <div className="grid grid-cols-1 gap-2 sm:flex">
            <button
              type="button"
              onClick={() => setAudienceMode("all")}
              className={cn(
                "flex min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-2 py-2.5 text-sm font-medium transition",
                audienceMode === "all"
                  ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              <Users className="h-4 w-4" />
              Select all
            </button>
            <button
              type="button"
              onClick={() => setAudienceMode("selected")}
              className={cn(
                "flex min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-2 py-2.5 text-sm font-medium transition",
                audienceMode === "selected"
                  ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              <Users className="h-4 w-4" />
              Select persons
            </button>
            <button
              type="button"
              onClick={() => setAudienceMode("segment")}
              className={cn(
                "flex min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-2 py-2.5 text-sm font-medium transition",
                audienceMode === "segment"
                  ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              <Filter className="h-4 w-4" />
              Segment
            </button>
          </div>

          {audienceMode === "segment" ? (
            <div className="mt-2 space-y-2">
              <select
                value={segmentId}
                onChange={(e) => setSegmentId(e.target.value)}
                className={inputClass}
                aria-label="Segment"
              >
                <option value="">{segmentsLoading ? "Loading segments…" : "— Choose a segment —"}</option>
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} · {s.count.toLocaleString()} contacts</option>
                ))}
              </select>
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <Info className="h-3.5 w-3.5 shrink-0" />
                {chosenSegment
                  ? `Sends to the ${chosenSegment.count.toLocaleString()} contacts matching "${chosenSegment.name}" when you launch.`
                  : "Filter contacts by city, tags, status and more."}{" "}
                <Link href="/segments" className="font-medium text-emerald-700 hover:text-emerald-900">Manage segments →</Link>
              </p>
            </div>
          ) : audienceMode === "all" ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
              <Info className="h-3.5 w-3.5 shrink-0" />
              Sends the template to every contact in this business.
            </p>
          ) : (
            <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <input
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                className={inputClass}
                placeholder="Search contacts…"
              />
              <div className="flex items-center justify-between gap-2">
                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    disabled={contacts.length === 0}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  Select all visible
                </label>
                <span className="text-xs tabular-nums text-slate-500">
                  {selectedIds.length} selected
                </span>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white">
                {contactsLoading ? (
                  <div className="flex items-center gap-2 px-3 py-4 text-xs text-slate-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading contacts…
                  </div>
                ) : contacts.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-slate-500">No contacts found.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {contacts.map((c) => (
                      <li key={c.id}>
                        <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(c.id)}
                            onChange={() => toggleContact(c.id)}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-800">
                              {c.name?.trim() || "Unnamed"}
                            </span>
                            <span className="block truncate text-xs text-slate-500">{c.phone}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

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

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>button]:h-10 [&>button]:w-full sm:[&>button]:h-9 sm:[&>button]:w-auto pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={review.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit || review.isPending}>
            {review.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking recipients…
              </>
            ) : (
              <>
                <Users className="h-4 w-4" />
                Review recipients
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>

    {/* Step 2 — final recipient list, checked by the server, before anything is created. */}
    <Modal
      open={open && !!reviewData}
      onClose={() => !create.isPending && setReviewData(null)}
      title="Review recipients"
      description="Check who gets this campaign and the cost before sending."
      className="max-w-2xl"
    >
      {reviewData && (
        <div className="space-y-4">
          {reviewData.cost && reviewData.cost.estimatedCostMinor > 0 && (
            <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span className="text-slate-600">
                Estimated cost · {reviewData.cost.units.toLocaleString()} messages
              </span>
              <span className="font-semibold tabular-nums text-slate-900">
                {formatInr(reviewData.cost.estimatedCostMinor)}
                <span className="ml-2 text-xs font-normal text-slate-500">balance {formatInr(reviewData.cost.balanceMinor)}</span>
              </span>
            </p>
          )}
          <ExcludedSummary report={reviewData} />
          <RecipientReview
            items={reviewData.recipients.map((r) => ({ key: r.contactId, phone: r.phone, name: r.name }))}
            removed={reviewRemoved}
            onRemovedChange={setReviewRemoved}
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>button]:h-10 [&>button]:w-full sm:[&>button]:h-9 sm:[&>button]:w-auto border-t border-slate-100 pt-4">
            <Button variant="secondary" onClick={() => setReviewData(null)} disabled={create.isPending}>
              Back
            </Button>
            <Button onClick={confirmCreate} disabled={finalCount === 0 || create.isPending}>
              {create.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
              ) : (
                <>{schedule ? "Schedule" : "Send"} to {finalCount.toLocaleString()}</>
              )}
            </Button>
          </div>
        </div>
      )}
    </Modal>
    </>
  );
}
