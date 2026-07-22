"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, GripVertical, Pencil, RotateCcw, Save } from "lucide-react";
import { Button, Card, Field, Modal, inputClass } from "@/components/ui";
import { Toggle } from "@/components/ui/Toggle";
import {
  useLeadStages,
  useUpdateLeadStages,
  DEFAULT_LEAD_STAGES,
  type LeadStageMeta,
} from "@/hooks/useLeadStages";
import { cn, STAGE_COLORS, STAGE_COLOR_KEYS, type StageColor } from "@/lib/utils";

const signatureOf = (stages: LeadStageMeta[]) =>
  stages.map((s) => `${s.key}:${s.label}:${s.color}:${s.enabled}`).join("|");

const sameList = (a: LeadStageMeta[], b: LeadStageMeta[]) => signatureOf(a) === signatureOf(b);

/**
 * Lead Pipeline Stages manager.
 *
 * Reorder (drag & drop), enable/disable, and edit label + colour for the existing
 * `LeadStage` enum stages. Persisted to TenantSettings.leadStages via the shared
 * hook. Stages are enum-backed, so there is no create/hard-delete — hiding a stage
 * (disable) is the safe equivalent and never orphans lead records.
 *
 * The outer component owns the mutation (so its lifecycle survives the optimistic
 * cache update) and re-keys the editor on the server signature, so the working copy
 * is re-seeded from the server without a setState-in-effect.
 */
export function LeadStagesTab() {
  const { allStages, isLoading } = useLeadStages();
  const update = useUpdateLeadStages();
  const [saved, setSaved] = useState(false);

  const signature = useMemo(() => signatureOf(allStages), [allStages]);

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
      initial={allStages}
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
  initial: LeadStageMeta[];
  saving: boolean;
  error: Error | null;
  saved: boolean;
  onSave: (list: LeadStageMeta[]) => void;
}) {
  const [list, setList] = useState<LeadStageMeta[]>(() => initial.map((s) => ({ ...s })));
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

  function patch(index: number, changes: Partial<LeadStageMeta>) {
    setList((prev) => prev.map((s, i) => (i === index ? { ...s, ...changes } : s)));
  }

  function toggle(index: number, next: boolean) {
    // Disabling a stage hides its pipeline column — confirm first. The API also
    // guards against disabling the last enabled stage.
    if (!next) {
      if (enabledCount <= 1) return;
      setConfirmDisable(index);
      return;
    }
    patch(index, { enabled: true });
  }

  const editing = editIndex !== null ? list[editIndex] : null;

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">Lead Pipeline Stages</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Reorder, rename, recolour and show/hide the stages in your pipeline. The order
              here drives the pipeline columns and the Add / Edit Lead dropdowns.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setList(DEFAULT_LEAD_STAGES.map((s) => ({ ...s })))}>
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to defaults
          </Button>
        </div>

        <ul className="mt-5 space-y-2">
          {list.map((stage, index) => (
            <li
              key={stage.key}
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
                aria-label={`Reorder ${stage.label}`}
                className="cursor-grab text-slate-400 hover:text-slate-600 active:cursor-grabbing"
              >
                <GripVertical className="h-4 w-4" />
              </button>

              <span
                aria-hidden
                className={cn("h-2.5 w-2.5 shrink-0 rounded-full", STAGE_COLORS[stage.color].dot)}
              />

              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-sm font-medium", stage.enabled ? "text-slate-900" : "text-slate-500")}>
                  {stage.label}
                </p>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">{stage.key}</p>
              </div>

              <Button variant="ghost" size="sm" onClick={() => setEditIndex(index)}>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>

              <Toggle
                checked={stage.enabled}
                onChange={(next) => toggle(index, next)}
                disabled={stage.enabled && enabledCount <= 1}
                label={`Enable ${stage.label}`}
              />
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

      {/* Edit stage (label + colour) */}
      {editing && editIndex !== null && (
        <Modal
          open
          onClose={() => setEditIndex(null)}
          title="Edit stage"
          description={`Customise how "${editing.key}" appears in your pipeline.`}
        >
          <div className="space-y-4">
            <Field label="Label" htmlFor="stage-label" required>
              <input
                id="stage-label"
                className={inputClass}
                maxLength={40}
                value={editing.label}
                onChange={(e) => patch(editIndex, { label: e.target.value })}
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
          description={`"${list[confirmDisable].label}" will be removed from the pipeline and the Add / Edit Lead dropdowns.`}
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
