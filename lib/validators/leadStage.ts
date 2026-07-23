import { z } from "zod";
import { STAGE_COLOR_KEYS, type StageColor } from "@/lib/utils";

/**
 * Validation for the dynamic pipeline-stage manager (PATCH /api/lead-stages).
 *
 * The request carries the tenant's *entire desired* stage list; the route diffs it
 * against what exists to create, update, reorder and delete in one atomic save. A stage
 * with an `id` targets an existing row; one without is a create. `order` is implied by
 * array position, so it is not part of the item shape.
 */
const stageColorEnum = z.enum(STAGE_COLOR_KEYS as [StageColor, ...StageColor[]]);
const stageOutcomeEnum = z.enum(["OPEN", "WON", "LOST"]);

export const pipelineStageInputSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, "Stage name is required").max(40, "Stage name is too long"),
  color: stageColorEnum,
  enabled: z.boolean(),
  isDefault: z.boolean(),
  outcome: stageOutcomeEnum.default("OPEN"),
});

export const updatePipelineStagesSchema = z
  .object({
    stages: z.array(pipelineStageInputSchema).min(1, "At least one stage is required"),
  })
  .refine((v) => v.stages.some((s) => s.enabled), {
    message: "At least one stage must stay enabled",
    path: ["stages"],
  })
  .refine(
    (v) => {
      const names = v.stages.map((s) => s.name.trim().toLowerCase());
      return new Set(names).size === names.length;
    },
    { message: "Stage names must be unique", path: ["stages"] },
  )
  .refine((v) => v.stages.filter((s) => s.isDefault).length <= 1, {
    message: "Only one stage can be the default",
    path: ["stages"],
  })
  .refine(
    (v) => {
      const def = v.stages.find((s) => s.isDefault);
      return !def || def.enabled;
    },
    { message: "The default stage must be enabled", path: ["stages"] },
  );

export type PipelineStageInput = z.infer<typeof pipelineStageInputSchema>;
export type UpdatePipelineStagesInput = z.infer<typeof updatePipelineStagesSchema>;
