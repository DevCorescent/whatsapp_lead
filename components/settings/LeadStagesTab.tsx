"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, GripVertical, Pencil, Plus, RotateCcw, Save, Star, Trash2 } from "lucide-react";
import { Button, Card, Field, Modal, inputClass, selectClass } from "@/components/ui";
import { Toggle } from "@/components/ui/Toggle";
import {
  useLeadStages,
  useUpdateLeadStages,
  DEFAULT_STAGE_DRAFTS,
  type StageDraft,
  type StageOutcome,
} from "@/hooks/useLeadStages";
import { cn, STAGE_COLORS, STAGE_COLOR_KEYS, type StageColor } from "@/lib/utils";

const OUTCOME_LABEL: Record<StageOutcome, string> = {
  OPEN: "Open",
  WON: "Won",
  LOST: "Lost",
};

const signatureOf = (stages: StageDraft[]) =>
  stages
    .map((s) => `${s.id ?? "new"}:${s.name}:${s.color}:${s.enabled}:${s.isDefault}:${s.outcome}`)
    .join("|");

const sameList = (a: StageDraft[], b: StageDraft[]) => signatureOf(a) === signatureOf(b);

/**
 * Lead Pipeline Stages manager — full CRUD over the dynamic `PipelineStage` entity.
 *
 * Administrators can add, rename, recolour, reorder (drag & drop), enable/disable, set the
 * default and delete stages, all against a working copy that is saved in one atomic PATCH.
 * The outer component owns the mutation (so its lifecycle survives the optimistic cache
 * update) and re-keys the editor on the server signature, so the working copy is re-seeded
 * from the server without a setState-in-effect.
 */
export function LeadStagesTab() {
  const { allStages, isLoading } = useLeadStages();
  const update = useUpdateLeadStages();
  const [saved, setSaved] = useState(false);

  const initial: StageDraft[] = allStages.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    enabled: s.enabled,
    isDefault: s.isDefault,
    outcome: s.outcome,
  }));
  const signature = useMemo(() => signatureOf(initial), [initial]);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-72 rounded-xl bg-slate-100" />
      </div>
    );
  }

  return (
    <StageManager
      key={signature}
      initial={initial}
      saving={update.isPending}
      error={update.error as Error | null}
      saved={saved}
      onSave={(list) =>
        update.mutate(list, {
          onSuccess: () => {
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
          },
        })
      }
    />
  );
}

function StageManager({
  initial,
  saving,
  error,
  saved,
  onSave,
}: {
  initial: StageDraft[];
  saving: boolean;
  error: Error | null;
  saved: boolean;
  onSave: (list: StageDraft[]) => void;
}) {
  const [list, setList] = useState<StageDraft[]>(() => initial.map((s) => ({ ...s })));
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [confirmDisable, setConfirmDisable] = useState<number | null>(null);

  const dirty = useMemo(() => !sameList(list, initial), [list, initial]);
  const enabledCount = list.filter((s) => s.enabled).length;

  function move(from: number, to: number) {
    if (from === to || to < 0 || to >= list.length) return;
    setList((prev) => {
      const next = prev.slice();
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  function patch(index: number, changes: Partial<StageDraft>) {
    setList((prev) => prev.map((s, i) => (i === index ? { ...s, ...changes } : s)));
  }

  function toggle(index: number, next: boolean) {
    // Disabling hides a column and can strand the default — confirm first. The API also
    // guards against zero enabled stages and against disabling the default.
    if (!next) {
      if (enabledCount <= 1 || list[index].isDefault) return;
      setConfirmDisable(index);
      return;
    }
    patch(index, { enabled: true });
  }

  function setDefault(index: number) {
    // Exactly one default, and it must be enabled — mirror both invariants client-side.
    setList((prev) => prev.map((s, i) => ({ ...s, isDefault: i === index, enabled: i === index ? true : s.enabled })));
  }

  function addStage() {
    setList((prev) => [
      ...prev,
      { name: `Stage ${prev.length + 1}`, color: "slate", enabled: true, isDefault: false, outcome: "OPEN" },
    ]);
    setEditIndex(list.length);
  }

  function removeStage(index: number) {
    setList((prev) => {
      const next = prev.filter((_, i) => i !== index);
      // If the removed stage was the default, promote the first remaining enabled one.
      if (prev[index].isDefault && next.length > 0) {
        const promote = next.findIndex((s) => s.enabled);
        if (promote >= 0) next[promote] = { ...next[promote], isDefault: true };
      }
      return next;
    });
  }

  const editing = editIndex !== null ? list[editIndex] : null;

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">Lead Pipeline Stages</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Add, reorder, rename, recolour and show/hide the stages in your pipeline. The order
              here drives the pipeline columns and the Add / Edit Lead dropdowns.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setList(DEFAULT_STAGE_DRAFTS.map((s) => ({ ...s })))}>
              <RotateCcw className="h-3.5 w-3.5" />
              Reset to defaults
            </Button>
            <Button variant="secondary" size="sm" onClick={addStage}>
              <Plus className="h-3.5 w-3.5" />
              Add stage
            </Button>
          </div>
        </div>

        <ul className="mt-5 space-y-2">
          {list.map((stage, index) => (
            <li
              key={stage.id ?? `new-${index}`}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => {
                if (dragIndex === null) return;
                e.preventDefault();
                if (dragIndex !== index) {
                  move(dragIndex, index);
                  setDragIndex(index);
                }
              }}
              onDragEnd={() => setDragIndex(null)}
              className={cn(
                "flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition",
                dragIndex === index ? "opacity-60 ring-2 ring-emerald-300" : "hover:border-slate-300",
                !stage.enabled && "bg-slate-50",
              )}
            >
              <button
                type="button"
                aria-label={`Reorder ${stage.name}`}
                className="cursor-grab text-slate-400 hover:text-slate-600 active:cursor-grabbing"
              >
                <GripVertical className="h-4 w-4" />
              </button>

              <span
                aria-hidden
                className={cn("h-2.5 w-2.5 shrink-0 rounded-full", STAGE_COLORS[stage.color].dot)}
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className={cn("truncate text-sm font-medium", stage.enabled ? "text-slate-900" : "text-slate-500")}>
                    {stage.name || "Untitled stage"}
                  </p>
                  {stage.outcome !== "OPEN" && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {OUTCOME_LABEL[stage.outcome]}
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDefault(index)}
                aria-pressed={stage.isDefault}
                aria-label={stage.isDefault ? `${stage.name} is the default stage` : `Make ${stage.name} the default`}
                title={stage.isDefault ? "Default stage for new leads" : "Set as default stage"}
                className={cn(
                  "rounded-lg p-1.5 transition",
                  stage.isDefault ? "text-amber-500" : "text-slate-300 hover:bg-slate-100 hover:text-slate-500",
                )}
              >
                <Star className={cn("h-4 w-4", stage.isDefault && "fill-amber-400")} />
              </button>

              <Button variant="ghost" size="sm" onClick={() => setEditIndex(index)}>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>

              <Toggle
                checked={stage.enabled}
                onChange={(next) => toggle(index, next)}
                disabled={stage.enabled && (enabledCount <= 1 || stage.isDefault)}
                label={`Enable ${stage.name}`}
              />

              <button
                type="button"
                onClick={() => removeStage(index)}
                disabled={list.length <= 1}
                aria-label={`Delete ${stage.name}`}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>

        {error && <p className="mt-3 text-sm text-rose-600">{error.message}</p>}

        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-400">
            {dirty ? "You have unsaved changes." : "All changes saved."}
          </p>
          <Button onClick={() => onSave(list)} disabled={!dirty || saving}>
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : saved ? "Saved!" : "Save Changes"}
          </Button>
        </div>
      </Card>

      {/* Edit stage (name + colour + outcome) */}
      {editing && editIndex !== null && (
        <Modal
          open
          onClose={() => setEditIndex(null)}
          title="Edit stage"
          description="Customise how this stage appears and behaves in your pipeline."
        >
          <div className="space-y-4">
            <Field label="Name" htmlFor="stage-name" required>
              <input
                id="stage-name"
                className={inputClass}
                maxLength={40}
                value={editing.name}
                onChange={(e) => patch(editIndex, { name: e.target.value })}
                autoFocus
              />
            </Field>

            <Field label="Colour" htmlFor="stage-color">
              <div className="flex flex-wrap gap-2" id="stage-color">
                {STAGE_COLOR_KEYS.map((c: StageColor) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={STAGE_COLORS[c].label}
                    aria-pressed={editing.color === c}
                    onClick={() => patch(editIndex, { color: c })}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full ring-1 ring-inset ring-slate-200 transition",
                      editing.color === c ? "ring-2 ring-emerald-500" : "hover:ring-slate-300",
                    )}
                  >
                    <span className={cn("h-4 w-4 rounded-full", STAGE_COLORS[c].dot)} />
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Outcome" htmlFor="stage-outcome">
              <select
                id="stage-outcome"
                className={selectClass}
                value={editing.outcome}
                onChange={(e) => patch(editIndex, { outcome: e.target.value as StageOutcome })}
              >
                <option value="OPEN">Open — an active stage in the pipeline</option>
                <option value="WON">Won — closes the deal as won (counts as revenue)</option>
                <option value="LOST">Lost — closes the deal as lost</option>
              </select>
            </Field>

            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
              <Button variant="secondary" onClick={() => setEditIndex(null)}>
                Done
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm before hiding a stage */}
      {confirmDisable !== null && list[confirmDisable] && (
        <Modal
          open
          onClose={() => setConfirmDisable(null)}
          title="Hide this stage?"
          description={`"${list[confirmDisable].name}" will be removed from the pipeline and the Add / Edit Lead dropdowns.`}
        >
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-600/20">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Existing leads keep this stage and stay visible in the list view — nothing is
                deleted. You can re-enable it here at any time.
              </span>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
              <Button variant="secondary" onClick={() => setConfirmDisable(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  patch(confirmDisable, { enabled: false });
                  setConfirmDisable(null);
                }}
              >
                Hide stage
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
