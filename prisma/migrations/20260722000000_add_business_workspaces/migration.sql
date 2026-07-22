-- ============================================================================
-- Migration: Add Business (Workspace) layer
-- ============================================================================
--
-- Introduces a Business between Tenant and every operational record so a single
-- tenant can own many independent WhatsApp business accounts. This migration is
-- SAFE for existing data: it adds nullable columns, backfills a default Business
-- per tenant (carrying over that tenant's WhatsApp + AI settings), and only then
-- promotes the columns to NOT NULL. No rows are deleted and no existing column is
-- dropped except the tenant-scoped unique constraints that are re-keyed onto the
-- new businessId.
--
-- The project normally provisions its schema with `prisma db push`; this file is
-- provided for environments that apply changes as reviewed SQL. Apply it inside a
-- transaction (psql runs each file in one by default) BEFORE deploying the code
-- that assumes businessId is present.
-- ============================================================================

-- ─── 1. Enum ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "BusinessStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. businesses table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "businesses" (
  "id"                    TEXT NOT NULL,
  "tenantId"              TEXT NOT NULL,
  "name"                  TEXT NOT NULL,
  "slug"                  TEXT NOT NULL,
  "whatsappPhoneNumber"   TEXT,
  "whatsappPhoneNumberId" TEXT,
  "whatsappBusinessId"    TEXT,
  "whatsappAccessToken"   TEXT,
  "whatsappVerifyToken"   TEXT,
  "status"                "BusinessStatus" NOT NULL DEFAULT 'ACTIVE',
  "logo"                  TEXT,
  "timezone"              TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  "aiEnabled"             BOOLEAN NOT NULL DEFAULT false,
  "autoReply"             BOOLEAN NOT NULL DEFAULT false,
  "autoReplyDelay"        INTEGER NOT NULL DEFAULT 3,
  "aiModel"               TEXT,
  "aiSystemPrompt"        TEXT,
  "aiPersonality"         TEXT,
  "aiResponseTone"        TEXT,
  "aiTemperature"         DOUBLE PRECISION NOT NULL DEFAULT 0.7,
  "aiMaxTokens"           INTEGER NOT NULL DEFAULT 500,
  "offHoursMessage"       TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "businesses_whatsappPhoneNumberId_key" ON "businesses"("whatsappPhoneNumberId");
CREATE UNIQUE INDEX IF NOT EXISTS "businesses_slug_tenantId_key" ON "businesses"("slug", "tenantId");
CREATE INDEX IF NOT EXISTS "businesses_tenantId_idx" ON "businesses"("tenantId");

DO $$ BEGIN
  ALTER TABLE "businesses"
    ADD CONSTRAINT "businesses_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 3. Add nullable businessId to every scoped table ────────────────────────
ALTER TABLE "contacts"          ADD COLUMN IF NOT EXISTS "businessId" TEXT;
ALTER TABLE "tags"              ADD COLUMN IF NOT EXISTS "businessId" TEXT;
ALTER TABLE "conversations"     ADD COLUMN IF NOT EXISTS "businessId" TEXT;
ALTER TABLE "messages"          ADD COLUMN IF NOT EXISTS "businessId" TEXT;
ALTER TABLE "quick_replies"     ADD COLUMN IF NOT EXISTS "businessId" TEXT;
ALTER TABLE "leads"             ADD COLUMN IF NOT EXISTS "businessId" TEXT;
ALTER TABLE "message_templates" ADD COLUMN IF NOT EXISTS "businessId" TEXT;
ALTER TABLE "campaigns"         ADD COLUMN IF NOT EXISTS "businessId" TEXT;
ALTER TABLE "chatbot_flows"     ADD COLUMN IF NOT EXISTS "businessId" TEXT;
ALTER TABLE "tickets"           ADD COLUMN IF NOT EXISTS "businessId" TEXT;
ALTER TABLE "knowledge_docs"    ADD COLUMN IF NOT EXISTS "businessId" TEXT;

-- ─── 4. Backfill: one default Business per tenant ────────────────────────────
-- Deterministic id ('biz_' || tenantId) so child rows can be re-pointed by join.
-- WhatsApp + AI settings are carried over from tenant_settings so the existing
-- single-number setup keeps working unchanged (Step 11 — backward compatibility).
INSERT INTO "businesses" (
  "id", "tenantId", "name", "slug",
  "whatsappPhoneNumber", "whatsappPhoneNumberId", "whatsappBusinessId", "whatsappAccessToken", "whatsappVerifyToken",
  "status", "timezone",
  "aiEnabled", "autoReply", "autoReplyDelay", "aiModel", "aiSystemPrompt", "aiPersonality", "aiResponseTone", "aiTemperature", "aiMaxTokens", "offHoursMessage",
  "createdAt", "updatedAt"
)
SELECT
  'biz_' || t."id", t."id", t."name", 'default',
  ts."waPhoneNumberId", ts."waPhoneNumberId", ts."waBusinessAccountId", ts."waApiKey", ts."waWebhookVerifyToken",
  'ACTIVE', COALESCE(ts."timezone", 'Asia/Kolkata'),
  COALESCE(ts."aiEnabled", false), COALESCE(ts."autoReply", false), COALESCE(ts."autoReplyDelay", 3),
  ts."aiModel", ts."aiSystemPrompt", ts."aiPersonality", ts."aiResponseTone",
  COALESCE(ts."aiTemperature", 0.7), COALESCE(ts."aiMaxTokens", 500), ts."offHoursMessage",
  t."createdAt", CURRENT_TIMESTAMP
FROM "tenants" t
LEFT JOIN "tenant_settings" ts ON ts."tenantId" = t."id"
WHERE NOT EXISTS (SELECT 1 FROM "businesses" b WHERE b."id" = 'biz_' || t."id");

-- Re-point every existing row to its tenant's default business.
UPDATE "contacts"          SET "businessId" = 'biz_' || "tenantId" WHERE "businessId" IS NULL;
UPDATE "tags"              SET "businessId" = 'biz_' || "tenantId" WHERE "businessId" IS NULL;
UPDATE "conversations"     SET "businessId" = 'biz_' || "tenantId" WHERE "businessId" IS NULL;
UPDATE "messages"          SET "businessId" = 'biz_' || "tenantId" WHERE "businessId" IS NULL;
UPDATE "quick_replies"     SET "businessId" = 'biz_' || "tenantId" WHERE "businessId" IS NULL;
UPDATE "leads"             SET "businessId" = 'biz_' || "tenantId" WHERE "businessId" IS NULL;
UPDATE "message_templates" SET "businessId" = 'biz_' || "tenantId" WHERE "businessId" IS NULL;
UPDATE "campaigns"         SET "businessId" = 'biz_' || "tenantId" WHERE "businessId" IS NULL;
UPDATE "chatbot_flows"     SET "businessId" = 'biz_' || "tenantId" WHERE "businessId" IS NULL;
UPDATE "tickets"           SET "businessId" = 'biz_' || "tenantId" WHERE "businessId" IS NULL;
UPDATE "knowledge_docs"    SET "businessId" = 'biz_' || "tenantId" WHERE "businessId" IS NULL;

-- ─── 5. Promote businessId to NOT NULL ───────────────────────────────────────
ALTER TABLE "contacts"          ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "tags"              ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "conversations"     ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "messages"          ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "quick_replies"     ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "leads"             ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "message_templates" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "campaigns"         ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "chatbot_flows"     ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "tickets"           ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "knowledge_docs"    ALTER COLUMN "businessId" SET NOT NULL;

-- ─── 6. Foreign keys ─────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "contacts"          ADD CONSTRAINT "contacts_businessId_fkey"          FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  ALTER TABLE "tags"              ADD CONSTRAINT "tags_businessId_fkey"              FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  ALTER TABLE "conversations"     ADD CONSTRAINT "conversations_businessId_fkey"     FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  ALTER TABLE "messages"          ADD CONSTRAINT "messages_businessId_fkey"          FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  ALTER TABLE "quick_replies"     ADD CONSTRAINT "quick_replies_businessId_fkey"     FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  ALTER TABLE "leads"             ADD CONSTRAINT "leads_businessId_fkey"             FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  ALTER TABLE "campaigns"         ADD CONSTRAINT "campaigns_businessId_fkey"         FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  ALTER TABLE "chatbot_flows"     ADD CONSTRAINT "chatbot_flows_businessId_fkey"     FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  ALTER TABLE "tickets"           ADD CONSTRAINT "tickets_businessId_fkey"           FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  ALTER TABLE "knowledge_docs"    ADD CONSTRAINT "knowledge_docs_businessId_fkey"    FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 7. Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "contacts_businessId_idx"                ON "contacts"("businessId");
CREATE INDEX IF NOT EXISTS "tags_businessId_idx"                    ON "tags"("businessId");
CREATE INDEX IF NOT EXISTS "conversations_businessId_status_idx"    ON "conversations"("businessId", "status");
CREATE INDEX IF NOT EXISTS "conversations_businessId_lastMessageAt_idx" ON "conversations"("businessId", "lastMessageAt" DESC);
CREATE INDEX IF NOT EXISTS "messages_businessId_idx"                ON "messages"("businessId");
CREATE INDEX IF NOT EXISTS "leads_businessId_stage_idx"             ON "leads"("businessId", "stage");
CREATE INDEX IF NOT EXISTS "message_templates_businessId_idx"       ON "message_templates"("businessId");
CREATE INDEX IF NOT EXISTS "campaigns_businessId_status_idx"        ON "campaigns"("businessId", "status");
CREATE INDEX IF NOT EXISTS "chatbot_flows_businessId_idx"           ON "chatbot_flows"("businessId");
CREATE INDEX IF NOT EXISTS "tickets_businessId_status_idx"          ON "tickets"("businessId", "status");
CREATE INDEX IF NOT EXISTS "knowledge_docs_businessId_idx"          ON "knowledge_docs"("businessId");

-- ─── 8. Re-key tenant-scoped uniques onto businessId ─────────────────────────
-- A phone / tag / template / shortcode is now unique per business, not per tenant,
-- so the same customer can exist independently in two businesses of one tenant.
ALTER TABLE "contacts"          DROP CONSTRAINT IF EXISTS "contacts_phone_tenantId_key";
ALTER TABLE "tags"              DROP CONSTRAINT IF EXISTS "tags_name_tenantId_key";
ALTER TABLE "message_templates" DROP CONSTRAINT IF EXISTS "message_templates_name_tenantId_key";
ALTER TABLE "quick_replies"     DROP CONSTRAINT IF EXISTS "quick_replies_shortcode_tenantId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "contacts_phone_businessId_key"           ON "contacts"("phone", "businessId");
CREATE UNIQUE INDEX IF NOT EXISTS "tags_name_businessId_key"                ON "tags"("name", "businessId");
CREATE UNIQUE INDEX IF NOT EXISTS "message_templates_name_businessId_key"   ON "message_templates"("name", "businessId");
CREATE UNIQUE INDEX IF NOT EXISTS "quick_replies_shortcode_businessId_key"  ON "quick_replies"("shortcode", "businessId");
