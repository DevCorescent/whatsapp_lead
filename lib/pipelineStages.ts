// ============================================================================
// MODULE : Pipeline stages (server-only)
//
// Shared server helpers for the dynamic lead pipeline: the DTO the API serves, and
// the provisioning that guarantees every tenant always has at least the default set
// of stages. Centralised here so the lead-stages route, the leads routes and analytics
// all speak the same shape and never re-implement provisioning.
// ============================================================================

import type { PipelineStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PIPELINE_STAGES, stageColorClasses } from "@/lib/utils";

/** A stage as the frontend consumes it — DB row plus derived Tailwind classes. */
export interface PipelineStageDTO {
  id: string;
  name: string;
  color: string;
  accent: string;
  dot: string;
  order: number;
  enabled: boolean;
  isDefault: boolean;
  outcome: "OPEN" | "WON" | "LOST";
}

export function toStageDTO(stage: PipelineStage): PipelineStageDTO {
  const { accent, dot } = stageColorClasses(stage.color);
  return {
    id: stage.id,
    name: stage.name,
    color: stage.color,
    accent,
    dot,
    order: stage.order,
    enabled: stage.enabled,
    isDefault: stage.isDefault,
    outcome: stage.outcome,
  };
}

/**
 * Return a tenant's stages, provisioning the defaults on first use.
 *
 * This is the backward-compatibility bridge: a tenant that existed before the dynamic
 * pipeline (or a freshly registered one) has no stage rows, so the first read seeds the
 * default set. Idempotent and safe under the concurrent first-loads a tenant's team can
 * trigger — `createMany({ skipDuplicates })` leans on the `@@unique([tenantId, name])`
 * constraint, and the result is always re-read from the database.
 */
export async function ensurePipelineStages(tenantId: string): Promise<PipelineStage[]> {
  const existing = await prisma.pipelineStage.findMany({
    where: { tenantId },
    orderBy: { order: "asc" },
  });
  if (existing.length > 0) return existing;

  await prisma.pipelineStage.createMany({
    data: DEFAULT_PIPELINE_STAGES.map((s, index) => ({
      tenantId,
      name: s.name,
      color: s.color,
      order: index,
      enabled: true,
      isDefault: s.isDefault,
      outcome: s.outcome,
    })),
    skipDuplicates: true,
  });

  return prisma.pipelineStage.findMany({ where: { tenantId }, orderBy: { order: "asc" } });
}

/**
 * Resolve the id of the stage new leads land in when the caller names none.
 *
 * Prefers the tenant's explicit default, then the first enabled stage, then the first
 * stage of any kind — so this never returns a disabled stage unless every stage is
 * disabled (which validation forbids).
 */
export async function defaultStageId(tenantId: string): Promise<string> {
  const stages = await ensurePipelineStages(tenantId);
  const chosen =
    stages.find((s) => s.isDefault && s.enabled) ??
    stages.find((s) => s.enabled) ??
    stages[0];
  return chosen.id;
}
