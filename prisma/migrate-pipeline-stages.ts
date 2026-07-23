// ============================================================================
// DATA MIGRATION — enum + JSON stages → dynamic PipelineStage rows
//
// Run once, in the INTERMEDIATE migration phase where BOTH the old columns
// (`leads.stage` enum, `tenant_settings.leadStages` JSON) and the new ones
// (`pipeline_stages` table, `leads.stageId` — nullable) exist. See the runbook
// in the implementation report for the exact three-step ordering.
//
//   npx tsx prisma/migrate-pipeline-stages.ts
//
// For every tenant it: (1) builds the stage set from that tenant's `leadStages`
// override (falling back to the defaults), (2) creates the `PipelineStage` rows,
// and (3) points every existing lead at the stage matching its old enum value.
// Idempotent: re-running skips tenants whose leads already carry a `stageId`.
// ============================================================================

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { DEFAULT_PIPELINE_STAGES } from "../lib/utils";

/** Legacy enum value → default stage definition (name/colour/outcome/order). */
const ENUM_DEFAULTS: Record<
  string,
  { name: string; color: string; outcome: "OPEN" | "WON" | "LOST"; order: number; isDefault: boolean }
> = {
  NEW_LEAD: { name: "New Lead", color: "blue", outcome: "OPEN", order: 0, isDefault: true },
  CONTACTED: { name: "Contacted", color: "violet", outcome: "OPEN", order: 1, isDefault: false },
  QUALIFIED: { name: "Qualified", color: "amber", outcome: "OPEN", order: 2, isDefault: false },
  PROPOSAL_SENT: { name: "Proposal Sent", color: "orange", outcome: "OPEN", order: 3, isDefault: false },
  NEGOTIATION: { name: "Negotiation", color: "pink", outcome: "OPEN", order: 4, isDefault: false },
  WON: { name: "Won", color: "emerald", outcome: "WON", order: 5, isDefault: false },
  LOST: { name: "Lost", color: "rose", outcome: "LOST", order: 6, isDefault: false },
};

type StoredOverride = { key?: string; label?: string; color?: string; order?: number; enabled?: boolean };

async function migrateTenant(tenantId: string) {
  // Already has stages? Assume this tenant was migrated — skip.
  const existing = await prisma.pipelineStage.count({ where: { tenantId } });
  if (existing > 0) {
    console.log(`  • ${tenantId}: already has ${existing} stages, skipping`);
    return;
  }

  // Read the legacy per-tenant override JSON (raw — the column is gone from the client).
  let overrides: StoredOverride[] = [];
  try {
    const rows = await prisma.$queryRawUnsafe<{ leadStages: unknown }[]>(
      `SELECT "leadStages" FROM tenant_settings WHERE "tenantId" = $1`,
      tenantId,
    );
    const raw = rows[0]?.leadStages;
    if (Array.isArray(raw)) overrides = raw as StoredOverride[];
  } catch {
    /* column already dropped or no settings row — fall back to defaults */
  }
  const overrideByKey = new Map(overrides.filter((o) => o?.key).map((o) => [o.key as string, o]));

  // Build the stage set: enum defaults, customised by any stored override.
  const stageDefs = Object.entries(ENUM_DEFAULTS).map(([key, def]) => {
    const o = overrideByKey.get(key);
    return {
      key,
      name: o?.label?.trim() || def.name,
      color: o?.color && typeof o.color === "string" ? o.color : def.color,
      order: typeof o?.order === "number" ? o.order : def.order,
      enabled: typeof o?.enabled === "boolean" ? o.enabled : true,
      outcome: def.outcome,
      isDefault: def.isDefault,
    };
  });
  stageDefs.sort((a, b) => a.order - b.order);

  await prisma.pipelineStage.createMany({
    data: stageDefs.map((s, index) => ({
      tenantId,
      name: s.name,
      color: s.color,
      order: index,
      enabled: s.enabled,
      isDefault: s.isDefault,
      outcome: s.outcome,
    })),
    skipDuplicates: true,
  });

  // Map each created stage back to the legacy enum key by name, then repoint leads.
  const created = await prisma.pipelineStage.findMany({ where: { tenantId }, select: { id: true, name: true } });
  const idByName = new Map(created.map((s) => [s.name, s.id]));

  let moved = 0;
  for (const def of stageDefs) {
    const stageId = idByName.get(def.name);
    if (!stageId) continue;
    // Compare `stage::text` so the script needs no reference to the (soon-dropped) enum type.
    const count = await prisma.$executeRawUnsafe(
      `UPDATE leads SET "stageId" = $1 WHERE "tenantId" = $2 AND "stage"::text = $3 AND "stageId" IS NULL`,
      stageId,
      tenantId,
      def.key,
    );
    moved += Number(count);
  }
  console.log(`  • ${tenantId}: created ${stageDefs.length} stages, moved ${moved} leads`);
}

async function main() {
  console.log("🔁 Migrating lead stages → PipelineStage rows…");
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  for (const t of tenants) await migrateTenant(t.id);

  // Safety net: any tenant that somehow ended up with none gets the defaults.
  console.log("🌱 Ensuring every tenant has at least the default stages…");
  for (const t of tenants) {
    const count = await prisma.pipelineStage.count({ where: { tenantId: t.id } });
    if (count === 0) {
      await prisma.pipelineStage.createMany({
        data: DEFAULT_PIPELINE_STAGES.map((s, index) => ({
          tenantId: t.id,
          name: s.name,
          color: s.color,
          order: index,
          enabled: true,
          isDefault: s.isDefault,
          outcome: s.outcome,
        })),
        skipDuplicates: true,
      });
    }
  }

  console.log("✅ Migration complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
