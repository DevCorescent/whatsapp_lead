-- ============================================================================
-- Dynamic Lead Pipeline: enum LeadStage  ->  PipelineStage table + Lead.stageId FK
--
-- Data-preserving and phased: the new column is added nullable, every existing lead
-- is repointed at the matching stage row, and only then is the column made NOT NULL
-- and the legacy enum/column dropped. Wrapped in a single transaction (Postgres DDL
-- is transactional) so it is all-or-nothing.
--
-- Note on workflow: this project manages its schema with `prisma db push`. This file
-- is the transform for EXISTING databases (which still hold enum data); a fresh
-- database is built directly from schema.prisma via `db push` + `db:seed`. It is
-- applied here with `prisma db execute --file`.
-- ============================================================================

BEGIN;

-- 1. New semantic-outcome enum (OPEN / WON / LOST).
CREATE TYPE "StageOutcome" AS ENUM ('OPEN', 'WON', 'LOST');

-- 2. The dynamic stage table (shape matches `prisma migrate diff` for schema.prisma).
CREATE TABLE "pipeline_stages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'slate',
    "order" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "outcome" "StageOutcome" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pipeline_stages_tenantId_order_idx" ON "pipeline_stages"("tenantId", "order");
CREATE UNIQUE INDEX "pipeline_stages_tenantId_name_key" ON "pipeline_stages"("tenantId", "name");

ALTER TABLE "pipeline_stages"
    ADD CONSTRAINT "pipeline_stages_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Provision the default stage set for every existing tenant. These names/colours/
--    outcomes mirror DEFAULT_PIPELINE_STAGES in lib/utils.ts, so the seed and this
--    migration produce identical stages.
INSERT INTO "pipeline_stages" ("id", "tenantId", "name", "color", "order", "enabled", "isDefault", "outcome", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    t."id",
    d.name,
    d.color,
    d.ord,
    true,
    d.is_default,
    d.outcome::"StageOutcome",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "tenants" t
CROSS JOIN (VALUES
    ('New Lead',      'blue',    0, true,  'OPEN'),
    ('Contacted',     'violet',  1, false, 'OPEN'),
    ('Qualified',     'amber',   2, false, 'OPEN'),
    ('Proposal Sent', 'orange',  3, false, 'OPEN'),
    ('Negotiation',   'pink',    4, false, 'OPEN'),
    ('Won',           'emerald', 5, false, 'WON'),
    ('Lost',          'rose',    6, false, 'LOST')
) AS d(name, color, ord, is_default, outcome);

-- 4. Add the FK column as nullable so existing rows are not rejected.
ALTER TABLE "leads" ADD COLUMN "stageId" TEXT;

-- 5. Backfill: point each lead at the tenant stage that matches its old enum value.
UPDATE "leads" l
SET "stageId" = ps."id"
FROM "pipeline_stages" ps
WHERE ps."tenantId" = l."tenantId"
  AND ps."name" = CASE l."stage"::text
        WHEN 'NEW_LEAD'      THEN 'New Lead'
        WHEN 'CONTACTED'     THEN 'Contacted'
        WHEN 'QUALIFIED'     THEN 'Qualified'
        WHEN 'PROPOSAL_SENT' THEN 'Proposal Sent'
        WHEN 'NEGOTIATION'   THEN 'Negotiation'
        WHEN 'WON'           THEN 'Won'
        WHEN 'LOST'          THEN 'Lost'
      END;

-- 6. Safety net: any lead not matched above lands in its tenant's default stage.
UPDATE "leads" l
SET "stageId" = ps."id"
FROM "pipeline_stages" ps
WHERE l."stageId" IS NULL
  AND ps."tenantId" = l."tenantId"
  AND ps."isDefault" = true;

-- 7. Now that every lead has a stage, enforce the constraint.
ALTER TABLE "leads" ALTER COLUMN "stageId" SET NOT NULL;

-- 8. Swap the index and add the FK.
DROP INDEX IF EXISTS "leads_tenantId_stage_idx";
CREATE INDEX "leads_tenantId_stageId_idx" ON "leads"("tenantId", "stageId");
ALTER TABLE "leads"
    ADD CONSTRAINT "leads_stageId_fkey"
    FOREIGN KEY ("stageId") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 9. Retire the legacy enum column and type.
ALTER TABLE "leads" DROP COLUMN "stage";
DROP TYPE "LeadStage";

COMMIT;
