"use client";

import { Clock, Loader2 } from "lucide-react";
import type { Lead, LeadScoreLabel } from "@prisma/client";
import { Avatar, Badge } from "@/components/ui";
import { cn, formatCurrency, SCORE_STYLE, daysBetween } from "@/lib/utils";

// ─── Shared pipeline types ────────────────────────────────────────────────────
//
// The API serialises Prisma models to JSON, so every `Date` arrives as a string.
// `Serialized<T>` keeps the Prisma model as the single source of truth for field
// names while widening the date fields, so the same object works whether it came
// off the wire (string) or out of an optimistic local update (Date).

type Serialized<T> = {
  [K in keyof T]: T[K] extends Date
    ? string | Date
    : T[K] extends Date | null
      ? string | Date | null
      : T[K];
};

export type LeadContact = {
  id: string;
  name: string | null;
  phone: string | null;
  avatarUrl?: string | null;
};

export type LeadAgent = {
  id: string;
  name: string | null;
  avatar?: string | null;
};

export type LeadActivityItem = {
  id: string;
  type: string;
  content?: string | null;
  createdAt: string | Date;
  user?: { name: string | null } | null;
};

/** The pipeline stage a lead references, as included by the leads API. */
export type LeadStageRef = {
  id: string;
  name: string;
  color?: string | null;
  order?: number | null;
  enabled?: boolean | null;
  outcome?: "OPEN" | "WON" | "LOST" | null;
};

/** A lead as the Kanban renders it: Prisma `Lead` + the relations the API includes. */
export type PipelineLead = Serialized<Lead> & {
  contact?: LeadContact | null;
  assignedTo?: LeadAgent | null;
  stage?: LeadStageRef | null;
  activities?: LeadActivityItem[] | null;
};

/** Leads bucketed by their `stageId` (a dynamic PipelineStage id). */
export type LeadsByStage = Record<string, PipelineLead[]>;

// ─── Card ─────────────────────────────────────────────────────────────────────

export function LeadCard({
  lead,
  isDragging,
  isSaving,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  lead: PipelineLead;
  isDragging?: boolean;
  /** A stage change for this card is in flight — lock dragging and show a spinner. */
  isSaving?: boolean;
  onOpen: (lead: PipelineLead) => void;
  onDragStart: (lead: PipelineLead) => void;
  onDragEnd: () => void;
}) {
  const scoreLabel: LeadScoreLabel = lead.scoreLabel;
  const days = daysBetween(lead.updatedAt);
  const contactName = lead.contact?.name ?? "Unknown contact";

  return (
    <article
      draggable={!isSaving}
      onDragStart={(e) => {
        // A card mid-save must not be dragged again — its stage is still settling on the server.
        if (isSaving) {
          e.preventDefault();
          return;
        }
        // Firefox refuses to start a drag unless some data is set.
        e.dataTransfer.setData("text/plain", lead.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(lead);
      }}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(lead)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(lead);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${lead.title} — ${contactName}`}
      aria-busy={isSaving}
      className={cn(
        "group relative cursor-grab active:cursor-grabbing select-none",
        "rounded-xl border border-slate-200 bg-white p-3 shadow-sm",
        "transition hover:border-slate-300 hover:shadow-md",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
        isDragging && "opacity-50",
        // While saving: dim slightly, block the grab cursor, and swallow pointer events so the
        // card cannot be re-dragged or re-opened until the PATCH resolves.
        isSaving && "pointer-events-none cursor-default opacity-60",
      )}
    >
      {isSaving && (
        <Loader2
          className="absolute right-2 top-2 h-3.5 w-3.5 animate-spin text-emerald-600"
          aria-hidden
        />
      )}
      {/* Contact */}
      <div className="flex items-center gap-2">
        <Avatar name={contactName} src={lead.contact?.avatarUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-slate-600">{contactName}</p>
          {lead.contact?.phone && (
            <p className="truncate text-[11px] text-slate-400">{lead.contact.phone}</p>
          )}
        </div>
      </div>

      {/* Title */}
      <p className="mt-2 truncate font-medium text-slate-900" title={lead.title}>
        {lead.title}
      </p>

      {/* Value + score */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-900">
          {formatCurrency(lead.value, lead.currency || "INR")}
        </span>
        <Badge className={cn("ml-auto", SCORE_STYLE[scoreLabel])}>{scoreLabel}</Badge>
      </div>

      {/* Footer: days in stage + assignee */}
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
          <Clock className="h-3 w-3" />
          {days}d in stage
        </span>
        {lead.assignedTo ? (
          <Avatar
            name={lead.assignedTo.name}
            src={lead.assignedTo.avatar}
            size="xs"
            className="ring-2 ring-white"
          />
        ) : (
          <span className="text-[11px] text-slate-300">Unassigned</span>
        )}
      </div>
    </article>
  );
}
