"use client";

import { useState } from "react";
import { Plus, Inbox } from "lucide-react";
import type { LeadScoreLabel } from "@prisma/client";
import { Button, EmptyState, Skeleton } from "@/components/ui";
import { cn, formatCurrency, scoreLabelFor } from "@/lib/utils";
import { useLeadStages } from "@/hooks/useLeadStages";
import { LeadCard, type LeadStageRef, type PipelineLead } from "./LeadCard";

// ─── Normalisation ────────────────────────────────────────────────────────────
//
// GET /api/leads returns `{ data: Lead[] }` where each lead carries its `stageId` and
// an included `stage` relation. Everything below accepts the array, the `{ data }` and
// `{ leads }` envelopes, and never throws — a malformed payload degrades to an empty board.

const SCORE_SET = new Set<string>(["COLD", "WARM", "HOT", "QUALIFIED"]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Coerce one raw record into a PipelineLead, or null if it isn't lead-shaped. */
function toLead(raw: unknown): PipelineLead | null {
  if (!isRecord(raw) || typeof raw.id !== "string") return null;

  // Leads reference a stage by id; accept the scalar `stageId` or fall back to the
  // included `stage.id` relation.
  const stageRef = isRecord(raw.stage) ? (raw.stage as LeadStageRef) : null;
  const stageId =
    typeof raw.stageId === "string" ? raw.stageId : stageRef?.id ?? "";

  const score = typeof raw.score === "number" && Number.isFinite(raw.score) ? raw.score : 0;

  const scoreLabel =
    typeof raw.scoreLabel === "string" && SCORE_SET.has(raw.scoreLabel)
      ? (raw.scoreLabel as LeadScoreLabel)
      : scoreLabelFor(score);

  const now = new Date().toISOString();

  return {
    ...(raw as unknown as PipelineLead),
    id: raw.id,
    title: typeof raw.title === "string" && raw.title ? raw.title : "Untitled lead",
    stageId,
    stage: stageRef,
    score,
    scoreLabel,
    value: typeof raw.value === "number" && Number.isFinite(raw.value) ? raw.value : null,
    currency: typeof raw.currency === "string" && raw.currency ? raw.currency : "INR",
    createdAt: (raw.createdAt as string | Date) ?? now,
    updatedAt: (raw.updatedAt as string | Date) ?? now,
  };
}

/** Accepts `Lead[]` | `{ data: … }` | `{ leads: … }` — anything else is []. */
export function normalizeLeads(raw: unknown): PipelineLead[] {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw.map(toLead).filter((l): l is PipelineLead => l !== null);
  }

  if (isRecord(raw)) {
    if ("data" in raw) return normalizeLeads(raw.data);
    if ("leads" in raw) return normalizeLeads(raw.leads);
  }

  return [];
}

/** Bucket leads by `stageId`, seeding a bucket for every provided stage id. */
function groupByStage(leads: PipelineLead[], stageIds: string[]): Record<string, PipelineLead[]> {
  const board: Record<string, PipelineLead[]> = {};
  for (const id of stageIds) board[id] = [];
  for (const lead of leads) {
    if (board[lead.stageId]) board[lead.stageId].push(lead);
  }
  return board;
}

// ─── Board ────────────────────────────────────────────────────────────────────

export function KanbanBoard({
  leads,
  isLoading,
  savingIds,
  onAddLead,
  onSelectLead,
  onMoveLead,
}: {
  leads: PipelineLead[];
  isLoading?: boolean;
  /** Ids of leads with an in-flight stage change; drives the per-card saving state. */
  savingIds?: Record<string, true>;
  onAddLead: (stageId: string) => void;
  onSelectLead: (lead: PipelineLead) => void;
  onMoveLead: (lead: PipelineLead, stageId: string) => void;
}) {
  const [dragging, setDragging] = useState<PipelineLead | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  // Columns, their order and visibility come entirely from the backend (GET /api/lead-stages)
  // via the shared hook — no hardcoded stage array here. Leads are bucketed by their `stageId`.
  const { stages } = useLeadStages();

  const board = groupByStage(leads, stages.map((s) => s.id));

  function handleDrop(stageId: string) {
    setDragOver(null);
    const lead = dragging;
    setDragging(null);
    if (!lead || lead.stageId === stageId) return;
    onMoveLead(lead, stageId);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="scrollbar-slim flex gap-4 overflow-x-auto pb-4">
        {stages.map(({ id: stageId, name, accent, dot }) => {
          const items = board[stageId] ?? [];
          const total = items.reduce((sum, l) => sum + (l.value ?? 0), 0);
          const isOver = dragOver === stageId;

          return (
            <section
              key={stageId}
              aria-label={name}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault(); // required to make this a valid drop target
                e.dataTransfer.dropEffect = "move";
                if (dragOver !== stageId) setDragOver(stageId);
              }}
              onDragLeave={(e) => {
                // Ignore bubbling leaves from child cards.
                if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                setDragOver((s) => (s === stageId ? null : s));
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(stageId);
              }}
              className={cn(
                "flex w-72 shrink-0 flex-col rounded-xl border border-t-4 border-slate-200 bg-slate-100/70",
                accent,
                isOver && "bg-emerald-50 ring-2 ring-emerald-300",
                "transition-colors",
              )}
            >
              {/* Header */}
              <header className="flex items-start gap-2 px-3 pt-3">
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dot)} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-sm font-semibold text-slate-800">{name}</h2>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500 ring-1 ring-inset ring-slate-200">
                      {items.length}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {total > 0 ? formatCurrency(total) : "—"}
                  </p>
                </div>
              </header>

              {/* Body */}
              <div className="scrollbar-slim flex min-h-40 flex-1 flex-col gap-2 overflow-y-auto p-3">
                {isLoading ? (
                  <>
                    <Skeleton className="h-28 w-full" />
                    <Skeleton className="h-28 w-full" />
                  </>
                ) : items.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-300 py-6">
                    <p className="text-xs text-slate-400">
                      {dragging ? "Drop here" : "No leads"}
                    </p>
                  </div>
                ) : (
                  items.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      isDragging={dragging?.id === lead.id}
                      isSaving={!!savingIds?.[lead.id]}
                      onOpen={onSelectLead}
                      onDragStart={setDragging}
                      onDragEnd={() => {
                        setDragging(null);
                        setDragOver(null);
                      }}
                    />
                  ))
                )}
              </div>

              {/* Ghost add button */}
              <button
                type="button"
                onClick={() => onAddLead(stageId)}
                className={cn(
                  "m-3 mt-0 inline-flex items-center justify-center gap-1.5 rounded-lg py-2",
                  "text-xs font-medium text-slate-500 transition",
                  "hover:bg-white hover:text-emerald-700",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
                )}
              >
                <Plus className="h-3.5 w-3.5" />
                Add lead
              </button>
            </section>
          );
        })}
      </div>

      {!isLoading && leads.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white">
          <EmptyState
            icon={Inbox}
            title="No leads in the pipeline"
            description="Leads will appear here as they come in. In the meantime you can drag cards between stages and create leads from any column."
            action={
              <Button size="sm" disabled={stages.length === 0} onClick={() => onAddLead(stages[0]?.id ?? "")}>
                <Plus className="h-4 w-4" />
                Add your first lead
              </Button>
            }
          />
        </div>
      )}
    </div>
  );
}
