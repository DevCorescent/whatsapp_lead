import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LeadStage } from "@prisma/client";
import { LEAD_STAGES, type StageColor } from "@/lib/utils";

/**
 * A single lead-pipeline stage as served by GET /api/lead-stages. `key` is the
 * existing `LeadStage` enum value — the dropdowns still submit these, so the Lead
 * flow is unchanged; only the label/colour/order/visibility are data-driven.
 */
export interface LeadStageMeta {
  key: LeadStage;
  label: string;
  color: StageColor;
  accent: string;
  dot: string;
  order: number;
  enabled: boolean;
}

/** Enum-derived default used as a resilient fallback (same shape the API serves). */
export const DEFAULT_LEAD_STAGES: LeadStageMeta[] = LEAD_STAGES.map((s, index) => ({
  key: s.stage,
  label: s.label,
  color: s.color,
  accent: s.accent,
  dot: s.dot,
  order: index,
  enabled: true,
}));

const QUERY_KEY = ["lead-stages"] as const;

async function fetchLeadStages(): Promise<LeadStageMeta[]> {
  const res = await fetch("/api/lead-stages");
  if (!res.ok) throw new Error("Failed to fetch lead stages");
  const json = await res.json();
  const data = (json as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data as LeadStageMeta[];
}

/**
 * The one reusable source of lead-stage config for the whole UI — Pipeline columns,
 * the Add Lead dropdown, the Edit Lead dropdown, badges and the Settings screen all
 * read from here, so there is no duplicated hardcoded stage array anywhere. React
 * Query caches the result and shares it across every consumer, so switching between
 * surfaces never refetches.
 *
 * - `stages`     → enabled, ordered (what the pipeline / dropdowns / badges show)
 * - `allStages`  → every stage incl. disabled, ordered (what the Settings manager edits)
 */
export function useLeadStages() {
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchLeadStages,
    staleTime: 5 * 60 * 1000,
  });

  const allStages = (query.data ?? DEFAULT_LEAD_STAGES).slice().sort((a, b) => a.order - b.order);
  const stages = allStages.filter((s) => s.enabled);

  return { ...query, stages, allStages };
}

/**
 * Persist the full stage config (reorder / enable-disable / edit label+colour) via
 * PATCH /api/lead-stages. Optimistically updates the shared cache so the manager and
 * the pipeline reflect changes instantly, then reconciles with the server response.
 */
export function useUpdateLeadStages() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (stages: LeadStageMeta[]) => {
      const res = await fetch("/api/lead-stages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stages: stages.map((s, index) => ({
            key: s.key,
            label: s.label,
            color: s.color,
            order: index,
            enabled: s.enabled,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to update lead stages");
      }
      return res.json();
    },
    onMutate: async (stages) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<LeadStageMeta[]>(QUERY_KEY);
      const optimistic = stages.map((s, index) => ({ ...s, order: index }));
      queryClient.setQueryData(QUERY_KEY, optimistic);
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
