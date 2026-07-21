"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Download, LayoutGrid, List, Plus, Search, X } from "lucide-react";
import type { LeadStage, LeadScoreLabel } from "@prisma/client";
import { useLeads } from "@/hooks/useLeads";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
  inputClass,
} from "@/components/ui";
import { cn, daysBetween, formatCurrency, STAGE_LABEL, SCORE_STYLE } from "@/lib/utils";
import { KanbanBoard, normalizeLeads } from "@/components/leads/KanbanBoard";
import type { PipelineLead } from "@/components/leads/LeadCard";
import { AddLeadModal } from "@/components/leads/AddLeadModal";
import { LeadDrawer } from "@/components/leads/LeadDrawer";

const SCORE_OPTIONS: LeadScoreLabel[] = ["COLD", "WARM", "HOT", "QUALIFIED"];

export default function LeadsPage() {
  const { data, isLoading, refetch } = useLeads();

  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [search, setSearch] = useState("");
  const [assignee, setAssignee] = useState("");
  const [score, setScore] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalStage, setModalStage] = useState<LeadStage>("NEW_LEAD");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /**
   * Optimistic stage moves live here rather than inside the board so they survive
   * a refetch and any change to the filters. PATCH /api/leads/:id is still a 501
   * stub, so in practice the override is rolled back and the user gets a toast.
   */
  const [overrides, setOverrides] = useState<Record<string, LeadStage>>({});
  const [toast, setToast] = useState<string | null>(null);

  const allLeads = useMemo(() => {
    const leads = normalizeLeads(data);
    return leads.map((l) => (overrides[l.id] ? { ...l, stage: overrides[l.id] } : l));
  }, [data, overrides]);

  const agents = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of allLeads) {
      if (l.assignedTo?.id) map.set(l.assignedTo.id, l.assignedTo.name ?? "Unnamed agent");
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [allLeads]);

  const leads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allLeads.filter((l) => {
      if (assignee && l.assignedToId !== assignee) return false;
      if (score && l.scoreLabel !== score) return false;
      if (!q) return true;
      return (
        l.title.toLowerCase().includes(q) ||
        (l.contact?.name ?? "").toLowerCase().includes(q) ||
        (l.contact?.phone ?? "").toLowerCase().includes(q)
      );
    });
  }, [allLeads, search, assignee, score]);

  const selected = useMemo(
    () => allLeads.find((l) => l.id === selectedId) ?? null,
    [allLeads, selectedId],
  );

  const filtersActive = Boolean(search || assignee || score);
  const pipelineValue = leads.reduce((sum, l) => sum + (l.value ?? 0), 0);

  function openAddModal(stage: LeadStage) {
    setModalStage(stage);
    setModalOpen(true);
  }

  async function moveLead(lead: PipelineLead, stage: LeadStage) {
    if (lead.stage === stage) return;
    const previous = lead.stage;

    setToast(null);
    setOverrides((o) => ({ ...o, [lead.id]: stage })); // optimistic move

    try {
      // TODO [GAURANSH]: PATCH /api/leads/:id — currently returns 501 Not Implemented.
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch (err) {
      setOverrides((o) => ({ ...o, [lead.id]: previous })); // revert
      const code = err instanceof Error ? err.message : "";
      setToast(
        code === "501"
          ? `Couldn't move "${lead.title}" to ${STAGE_LABEL[stage]} — the leads API isn't live yet.`
          : `Couldn't move "${lead.title}" to ${STAGE_LABEL[stage]}. Change reverted.`,
      );
    }
  }

  return (
    <div className="relative">
      <PageHeader
        title="Lead Pipeline"
        description={
          isLoading
            ? "Loading pipeline…"
            : `${leads.length} lead${leads.length === 1 ? "" : "s"} · ${formatCurrency(pipelineValue)} in play`
        }
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => window.location.assign("/api/leads/export")}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button onClick={() => openAddModal("NEW_LEAD")}>
              <Plus className="h-4 w-4" />
              Add Lead
            </Button>
          </div>
        }
      />

      {/* Filter bar */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            aria-label="Search leads"
            placeholder="Search leads or contacts…"
            className={cn(inputClass, "pl-9")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          aria-label="Filter by assignee"
          className={cn(inputClass, "w-auto min-w-40")}
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          disabled={agents.length === 0}
        >
          <option value="">{agents.length === 0 ? "No agents loaded" : "All assignees"}</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by score"
          className={cn(inputClass, "w-auto min-w-32")}
          value={score}
          onChange={(e) => setScore(e.target.value)}
        >
          <option value="">All scores</option>
          {SCORE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {filtersActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setAssignee("");
              setScore("");
            }}
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}

        {/* View toggle */}
        <div className="ml-auto inline-flex rounded-lg bg-slate-100 p-0.5">
          {(
            [
              { key: "kanban", label: "Kanban", icon: LayoutGrid },
              { key: "list", label: "List", icon: List },
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              aria-pressed={view === key}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition",
                view === key
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === "kanban" ? (
        <KanbanBoard
          leads={leads}
          isLoading={isLoading}
          onAddLead={openAddModal}
          onSelectLead={(lead) => setSelectedId(lead.id)}
          onMoveLead={moveLead}
        />
      ) : (
        <LeadTable
          leads={leads}
          isLoading={isLoading}
          onSelectLead={(lead) => setSelectedId(lead.id)}
          onAddLead={() => openAddModal("NEW_LEAD")}
        />
      )}

      {/* Non-blocking toast */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-start gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <span className="max-w-xs">{toast}</span>
          <button
            onClick={() => setToast(null)}
            aria-label="Dismiss"
            className="ml-2 rounded p-0.5 text-slate-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <AddLeadModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initialStage={modalStage}
        onCreated={() => refetch()}
      />

      <LeadDrawer lead={selected} onClose={() => setSelectedId(null)} onStageChange={moveLead} />
    </div>
  );
}

// ─── List view ────────────────────────────────────────────────────────────────

function LeadTable({
  leads,
  isLoading,
  onSelectLead,
  onAddLead,
}: {
  leads: PipelineLead[];
  isLoading?: boolean;
  onSelectLead: (lead: PipelineLead) => void;
  onAddLead: () => void;
}) {
  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (leads.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={List}
          title="No leads to show"
          description="Your pipeline will appear here once the leads API is live. You can still open the form and create a lead."
          action={
            <Button size="sm" onClick={onAddLead}>
              <Plus className="h-4 w-4" />
              Add Lead
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="scrollbar-slim overflow-x-auto">
        <table className="w-full min-w-[52rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Lead</th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Stage</th>
              <th className="px-4 py-3 font-medium">Score</th>
              <th className="px-4 py-3 text-right font-medium">Value</th>
              <th className="px-4 py-3 font-medium">Assignee</th>
              <th className="px-4 py-3 text-right font-medium">In stage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {leads.map((lead) => (
              <tr
                key={lead.id}
                onClick={() => onSelectLead(lead)}
                className="cursor-pointer transition hover:bg-slate-50"
              >
                <td className="max-w-64 truncate px-4 py-3 font-medium text-slate-900">
                  {lead.title}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={lead.contact?.name} src={lead.contact?.avatarUrl} size="xs" />
                    <span className="truncate text-slate-600">
                      {lead.contact?.name ?? "Unknown"}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge>{STAGE_LABEL[lead.stage]}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge className={SCORE_STYLE[lead.scoreLabel]}>{lead.scoreLabel}</Badge>
                </td>
                <td className="px-4 py-3 text-right font-medium text-slate-900">
                  {formatCurrency(lead.value, lead.currency || "INR")}
                </td>
                <td className="px-4 py-3">
                  {lead.assignedTo ? (
                    <div className="flex items-center gap-2">
                      <Avatar name={lead.assignedTo.name} src={lead.assignedTo.avatar} size="xs" />
                      <span className="truncate text-slate-600">{lead.assignedTo.name}</span>
                    </div>
                  ) : (
                    <span className="text-slate-400">Unassigned</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-slate-500">
                  {daysBetween(lead.updatedAt)}d
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
