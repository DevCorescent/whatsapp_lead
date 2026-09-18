-- Multiple WhatsApp numbers per business.
--
-- Additive: one new table and one nullable column on conversations. Nothing on
-- businesses or tenant_settings is touched — the legacy whatsapp* columns stay and
-- remain a working fallback.
--
-- Written to be re-runnable. Some environments already have "whatsapp_integrations"
-- from an earlier `prisma db push` of the first multi-number schema, which had a
-- composite (businessId, phoneNumberId) unique key, a NOT NULL accessToken and no
-- default guard. Every statement below therefore either creates-if-missing or
-- converges that earlier shape onto this one.
--
-- Two invariants Prisma cannot express in schema.prisma live here only:
--   · at most one default integration per business (partial unique index), and
--   · the check that refuses to proceed if a phone number is already duplicated.
-- NOTE: `prisma db push` does not know about the partial index and may drop it.
-- The application also serialises default changes under a row lock
-- (lib/whatsappIntegrations.ts), so losing the index degrades to "enforced in
-- code" rather than to "not enforced" — but re-apply this file after a db push.

-- CreateTable
CREATE TABLE IF NOT EXISTS "whatsapp_integrations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "displayName" TEXT,
    "phoneNumber" TEXT,
    "phoneNumberId" TEXT NOT NULL,
    "whatsappBusinessId" TEXT NOT NULL,
    "accessToken" TEXT,
    "verifyToken" TEXT,
    "appSecret" TEXT,
    "qualityRating" TEXT,
    "codeVerificationStatus" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whatsapp_integrations_pkey" PRIMARY KEY ("id")
);

-- Converge the earlier db-push shape: the token is wiped on disconnect.
ALTER TABLE "whatsapp_integrations" ALTER COLUMN "accessToken" DROP NOT NULL;
DROP INDEX IF EXISTS "whatsapp_integrations_businessId_phoneNumberId_key";
DROP INDEX IF EXISTS "whatsapp_integrations_phoneNumberId_idx";

-- phone_number_id is Meta's webhook routing key, so it must be globally unique.
-- Refuse loudly rather than silently pick a winner if existing data disagrees.
DO $$
DECLARE dupes TEXT;
BEGIN
  SELECT string_agg("phoneNumberId", ', ') INTO dupes
  FROM (
    SELECT "phoneNumberId" FROM "whatsapp_integrations"
    GROUP BY "phoneNumberId" HAVING COUNT(*) > 1
  ) d;
  IF dupes IS NOT NULL THEN
    RAISE EXCEPTION 'whatsapp_integrations has duplicate phoneNumberId values (%). Disconnect or delete the extra rows, then re-run this migration.', dupes;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_integrations_phoneNumberId_key" ON "whatsapp_integrations"("phoneNumberId");
CREATE INDEX IF NOT EXISTS "whatsapp_integrations_tenantId_idx" ON "whatsapp_integrations"("tenantId");
CREATE INDEX IF NOT EXISTS "whatsapp_integrations_businessId_idx" ON "whatsapp_integrations"("businessId");

-- A default must be active, and a business has at most one. Existing data is
-- converged first (keep the oldest default per business) so the index can build.
UPDATE "whatsapp_integrations" SET "isDefault" = false WHERE "isActive" = false AND "isDefault" = true;
UPDATE "whatsapp_integrations" w SET "isDefault" = false
WHERE w."isDefault" = true
  AND EXISTS (
    SELECT 1 FROM "whatsapp_integrations" o
    WHERE o."businessId" = w."businessId" AND o."isDefault" = true
      AND (o."createdAt" < w."createdAt" OR (o."createdAt" = w."createdAt" AND o."id" < w."id"))
  );
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_integrations_one_default_per_business"
  ON "whatsapp_integrations"("businessId") WHERE "isDefault" = true;

-- AlterTable: the number a conversation lives on. Null = legacy thread.
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "whatsappIntegrationId" TEXT;
CREATE INDEX IF NOT EXISTS "conversations_whatsappIntegrationId_idx" ON "conversations"("whatsappIntegrationId");

-- AddForeignKey (guarded: ADD CONSTRAINT has no IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_integrations_tenantId_fkey') THEN
    ALTER TABLE "whatsapp_integrations" ADD CONSTRAINT "whatsapp_integrations_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_integrations_businessId_fkey') THEN
    ALTER TABLE "whatsapp_integrations" ADD CONSTRAINT "whatsapp_integrations_businessId_fkey"
      FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  -- SET NULL: deleting an integration row must never delete conversation history.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_whatsappIntegrationId_fkey') THEN
    ALTER TABLE "conversations" ADD CONSTRAINT "conversations_whatsappIntegrationId_fkey"
      FOREIGN KEY ("whatsappIntegrationId") REFERENCES "whatsapp_integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
