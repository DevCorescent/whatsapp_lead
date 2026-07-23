"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Clock,
  History,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { useLead } from "@/hooks/useLeads";
import { useLeadStages } from "@/hooks/useLeadStages";
import { Avatar, Badge, Button, EmptyState } from "@/components/ui";
import {
  cn,
  daysBetween,
  formatCurrency,
  formatDate,
  SCORE_STYLE,
  timeAgo,
} from "@/lib/utils";
import type { LeadActivityItem, PipelineLead } from "./LeadCard";

// ─── Detail merge (defensive) ─────────────────────────────────────────────────
//
// GET /api/leads/[id] is a 501 stub, so `useLead` normally errors. The drawer
// always renders from the card we already have and treats the detail response as
// a bonus overlay when it eventually arrives.

function mergeDetail(base: PipelineLead, raw: unknown): PipelineLead {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const rec = raw as Record<string, unknown>;
  const detail = (rec.data && typeof rec.data === "object" ? rec.data : rec) as Record<
    string,
    unknown
  >;
  if (typeof detail.id !== "string" || detail.id !== base.id) return base;
  return { ...base, ...(detail as Partial<PipelineLead>) };
}

function activitiesOf(lead: PipelineLead): LeadActivityItem[] {
  const list = lead.activities;
  if (!Array.isArray(list)) return [];
  return list.flatMap((a) => {
    if (!a || typeof a !== "object") return [];
    const rec = a as Record<string, unknown>;
    if (typeof rec.id !== "string") return [];
    return [
      {
        id: rec.id,
        type: typeof rec.type === "string" ? rec.type : "NOTE",
        content: typeof rec.content === "string" ? rec.content : null,
        createdAt: (rec.createdAt as string | Date) ?? new Date().toISOString(),
        user:
          rec.user && typeof rec.user === "object"
            ? { name: (rec.user as Record<string, unknown>).name as string | null }
            : null,
      },
    ];
  });
}

const ACTIVITY_LABEL: Record<string, string> = {
  STAGE_CHANGED: "Stage changed",
  SCORE_UPDATED: "Score updated",
  NOTE: "Note added",
  CREATED: "Lead created",
  AI_QUALIFIED: "Qualified by AI",
};

// ─── BANT row ─────────────────────────────────────────────────────────────────

function BantRow({ label, value }: { label: string; value?: string | null }) {
  const filled = Boolean(value && value.trim());
  return (
    <li className="flex items-start gap-2.5">
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
          filled
            ? "border-emerald-600 bg-emerald-600 text-white"
            : "border-slate-300 bg-white",
        )}
      >
        {filled && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-700">{label}</p>
        <p className={cn("text-xs", filled ? "text-slate-500" : "text-slate-400 italic")}>
          {filled ? value : "Not captured"}
        </p>
      </div>
    </li>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────────

/**
 * The panel is unmounted while no lead is selected, so a stale error banner from
 * a previous lead can't survive into the next one — which is also why there is no
 * "reset on open" effect (it would trip react-hooks/set-state-in-effect).
 */
export function LeadDrawer({
  lead,
  onClose,
  onStageChange,
}: {
  lead: PipelineLead | null;
  onClose: () => void;
  onStageChange: (lead: PipelineLead, stageId: string) => void;
}) {
  if (!lead) return null;
  return <LeadDrawerPanel lead={lead} onClose={onClose} onStageChange={onStageChange} />;
}

function LeadDrawerPanel({
  lead,
  onClose,
  onStageChange,
}: {
  lead: PipelineLead;
  onClose: () => void;
  onStageChange: (lead: PipelineLead, stageId: string) => void;
}) {
  const [qualifying, setQualifying] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const detailQuery = useLead(lead.id);
  // Same backend-driven stage source as the board and Add Lead modal.
  const { stages } = useLeadStages();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const full = useMemo(() => mergeDetail(lead, detailQuery.data), [lead, detailQuery.data]);

  if (!full) return null;

  const activities = activitiesOf(full);
  const contactName = full.contact?.name ?? "Unknown contact";

  async function handleQualify() {
    setBanner(null);
    setQualifying(true);
    try {
      // TODO [GAURANSH]: POST /api/ai/qualify — currently returns 501 Not Implemented.
      const res = await fetch("/api/ai/qualify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead!.id, contactId: lead!.contactId }),
      });
      if (!res.ok) {
        setBanner(
          res.status === 501
            ? "AI qualification isn't wired up yet (501). BANT scoring will appear here once the endpoint ships."
            : `Couldn't qualify this lead (HTTP ${res.status}).`,
        );
        return;
      }
    } catch {
      setBanner("Network error — couldn't reach the AI qualification endpoint.");
    } finally {
      setQualifying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={full.title}>
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      <aside className="scrollbar-slim absolute inset-y-0 right-0 flex w-96 max-w-full flex-col overflow-y-auto bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-slate-900">{full.title}</h2>
              <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-slate-400">
                <Clock className="h-3 w-3" />
                {daysBetween(full.updatedAt)}d in stage · created {formatDate(full.createdAt)}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-6 px-5 py-5">
          {banner && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-inset ring-amber-600/20"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{banner}</span>
            </div>
          )}

          {/* Contact */}
          <section className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <Avatar name={contactName} src={full.contact?.avatarUrl} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{contactName}</p>
              <p className="truncate text-xs text-slate-500">
                {full.contact?.phone ?? "No phone on file"}
              </p>
            </div>
          </section>

          {/* Stage + value */}
          <section className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="drawer-stage"
                className="mb-1.5 block text-xs font-medium text-slate-500"
              >
                Stage
              </label>
              <select
                id="drawer-stage"
                value={full.stage?.id ?? ""}
                onChange={(e) => onStageChange(full, e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                {/* Keep the lead's current stage selectable even if it's been hidden. */}
                {full.stage?.id && !stages.some((s) => s.id === full.stage?.id) && (
                  <option value={full.stage.id}>{full.stage?.name ?? full.stage.id}</option>
                )}
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-500">Deal value</p>
              <p className="py-1.5 text-lg font-semibold text-slate-900">
                {formatCurrency(full.value, full.currency || "INR")}
              </p>
            </div>
          </section>

          {/* Score */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">Lead score</p>
              <Badge className={SCORE_STYLE[full.scoreLabel]}>
                {full.scoreLabel} · {full.score}
              </Badge>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={full.score}
              readOnly
              disabled
              aria-label={`Lead score ${full.score} of 100`}
              className="w-full accent-emerald-600 disabled:opacity-100"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Set by AI qualification — read-only here.
            </p>
          </section>

          {/* BANT */}
          <section>
            <p className="mb-2 text-xs font-medium text-slate-500">BANT qualification</p>
            <ul className="space-y-2.5 rounded-xl border border-slate-200 p-3">
              <BantRow label="Budget" value={full.budget} />
              <BantRow label="Authority" value={full.authority} />
              <BantRow label="Need" value={full.requirement} />
              <BantRow label="Timeline" value={full.timeline} />
            </ul>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3 w-full"
              onClick={handleQualify}
              disabled={qualifying}
            >
              {qualifying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 text-emerald-600" />
              )}
              {qualifying ? "Qualifying…" : "Qualify with AI"}
            </Button>
          </section>

          {/* Assignee */}
          <section>
            <p className="mb-2 text-xs font-medium text-slate-500">Assigned to</p>
            {full.assignedTo ? (
              <div className="flex items-center gap-2">
                <Avatar name={full.assignedTo.name} src={full.assignedTo.avatar} size="sm" />
                <span className="text-sm text-slate-700">{full.assignedTo.name}</span>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Unassigned</p>
            )}
          </section>

          {/* Notes */}
          <section>
            <p className="mb-2 text-xs font-medium text-slate-500">Notes</p>
            <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
              {full.notes?.trim() || "No notes yet."}
            </p>
          </section>

          {/* Activity timeline */}
          <section>
            <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <History className="h-3.5 w-3.5" />
              Activity
            </p>
            {activities.length === 0 ? (
              <EmptyState
                icon={History}
                title="No activity yet"
                description="Stage changes, notes and AI qualifications will show up here."
                className="rounded-xl border border-dashed border-slate-200 py-8"
              />
            ) : (
              <ol className="relative space-y-4 border-l border-slate-200 pl-4">
                {activities.map((a) => (
                  <li key={a.id} className="relative">
                    <span
                      aria-hidden
                      className="absolute -left-5.25 top-1.5 h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-white"
                    />
                    <p className="text-xs font-medium text-slate-800">
                      {ACTIVITY_LABEL[a.type] ?? a.type}
                    </p>
                    {a.content && <p className="mt-0.5 text-xs text-slate-500">{a.content}</p>}
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {a.user?.name ? `${a.user.name} · ` : ""}
                      {timeAgo(a.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
