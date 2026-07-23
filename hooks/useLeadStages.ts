import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_PIPELINE_STAGES, stageColorClasses, type StageColor } from "@/lib/utils";

/** Outcome a stage represents — mirrors the Prisma `StageOutcome` enum. */
export type StageOutcome = "OPEN" | "WON" | "LOST";

/**
 * A pipeline stage as served by GET /api/lead-stages. `id` is the `PipelineStage`
 * row id that every Lead references, so it is the identifier the board, dropdowns and
 * badges key off — labels/colours are data-driven, not hardcoded.
 */
export interface StageMeta {
  id: string;
  name: string;
  color: StageColor;
  accent: string;
  dot: string;
  order: number;
  enabled: boolean;
  isDefault: boolean;
  outcome: StageOutcome;
}

/** The editable shape the manager works with; `id` absent ⇒ a stage to create. */
export interface StageDraft {
  id?: string;
  name: string;
  color: StageColor;
  enabled: boolean;
  isDefault: boolean;
  outcome: StageOutcome;
}

/** The canonical defaults as drafts — used by the manager's "Reset to defaults". */
export const DEFAULT_STAGE_DRAFTS: StageDraft[] = DEFAULT_PIPELINE_STAGES.map((s) => ({
  name: s.name,
  color: s.color,
  enabled: true,
  isDefault: s.isDefault,
  outcome: s.outcome,
}));

const QUERY_KEY = ["lead-stages"] as const;

async function fetchLeadStages(): Promise<StageMeta[]> {
  const res = await fetch("/api/lead-stages");
  if (!res.ok) throw new Error("Failed to fetch lead stages");
  const json = await res.json();
  const data = (json as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data as StageMeta[];
}

/**
 * The one reusable source of pipeline-stage config for the whole UI — Pipeline columns,
 * the Add/Edit Lead dropdowns, badges, analytics and the Settings manager all read from
 * here, so there is no duplicated stage list anywhere. React Query caches and shares the
 * result across every consumer.
 *
 * - `stages`       → enabled, ordered (the pipeline / dropdowns / badges)
 * - `allStages`    → every stage incl. disabled, ordered (the Settings manager)
 * - `defaultStage` → where a new lead lands when none is chosen
 */
export function useLeadStages() {
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchLeadStages,
    staleTime: 5 * 60 * 1000,
  });

  const allStages = (query.data ?? []).slice().sort((a, b) => a.order - b.order);
  const stages = allStages.filter((s) => s.enabled);
  const defaultStage = allStages.find((s) => s.isDefault && s.enabled) ?? stages[0] ?? null;

  return { ...query, stages, allStages, defaultStage };
}

/** Turn drafts into an optimistic `StageMeta[]` so the manager & pipeline update instantly. */
function draftsToMeta(drafts: StageDraft[]): StageMeta[] {
  let defaultIndex = drafts.findIndex((s) => s.isDefault);
  if (defaultIndex === -1) defaultIndex = drafts.findIndex((s) => s.enabled);
  return drafts.map((s, index) => {
    const { accent, dot } = stageColorClasses(s.color);
    return {
      id: s.id ?? `pending-${index}`,
      name: s.name.trim(),
      color: s.color,
      accent,
      dot,
      order: index,
      enabled: s.enabled,
      isDefault: index === defaultIndex,
      outcome: s.outcome,
    };
  });
}

/**
 * Persist the full stage config (create / edit / reorder / enable-disable / delete /
 * set-default) via a single PATCH /api/lead-stages. Optimistically updates the shared
 * cache so the manager and pipeline reflect changes instantly, then reconciles with the
 * server (which assigns real ids to newly created stages).
 */
export function useUpdateLeadStages() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (drafts: StageDraft[]) => {
      const res = await fetch("/api/lead-stages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stages: drafts.map((s) => ({
            ...(s.id ? { id: s.id } : {}),
            name: s.name,
            color: s.color,
            enabled: s.enabled,
            isDefault: s.isDefault,
            outcome: s.outcome,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to update lead stages");
      }
      return res.json();
    },
    onMutate: async (drafts) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<StageMeta[]>(QUERY_KEY);
      queryClient.setQueryData(QUERY_KEY, draftsToMeta(drafts));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(QUERY_KEY, context.previous);
    },
    onSuccess: (json) => {
      const data = (json as { data?: unknown }).data;
      if (Array.isArray(data)) queryClient.setQueryData(QUERY_KEY, data);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
