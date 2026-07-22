import { z } from "zod";
import { LeadStage } from "@prisma/client";
import { STAGE_COLOR_KEYS, type StageColor } from "@/lib/utils";

/**
 * Validation for the per-tenant Lead pipeline stage config stored on
 * `TenantSettings.leadStages`. Mirrors the existing validator style (zod, one
 * schema per resource) and enforces the invariants the UI relies on.
 *
 * `key` is constrained to the existing `LeadStage` enum — the config only
 * customises how those enum stages appear; it never introduces assignable values
 * outside the enum, so the Lead flow and Lead.stage stay exactly as they are.
 */
const stageColorEnum = z.enum(STAGE_COLOR_KEYS as [StageColor, ...StageColor[]]);

export const leadStageConfigSchema = z.object({
  key: z.nativeEnum(LeadStage),
  label: z.string().trim().min(1, "Label is required").max(40, "Label is too long"),
  color: stageColorEnum,
  order: z.number().int().min(0),
  enabled: z.boolean(),
});

export const updateLeadStagesSchema = z
  .object({
    stages: z.array(leadStageConfigSchema).min(1, "At least one stage is required"),
  })
  .refine(
    (v) => new Set(v.stages.map((s) => s.key)).size === v.stages.length,
    { message: "Duplicate stage keys are not allowed", path: ["stages"] },
  )
  .refine((v) => v.stages.some((s) => s.enabled), {
    message: "At least one stage must stay enabled",
    path: ["stages"],
  });

export type LeadStageConfig = z.infer<typeof leadStageConfigSchema>;
export type UpdateLeadStagesInput = z.infer<typeof updateLeadStagesSchema>;
