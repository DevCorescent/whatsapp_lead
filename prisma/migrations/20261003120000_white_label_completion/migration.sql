-- Phase 5: white-label completion — free subdomains, landing page, brand legal pages,
-- and the monthly white-label fee (dynamic, set by the super admin).
-- Idempotent, like the other migrations here.

ALTER TABLE "white_label_configs" ADD COLUMN IF NOT EXISTS "subdomain" TEXT;
ALTER TABLE "white_label_configs" ADD COLUMN IF NOT EXISTS "landingEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "white_label_configs" ADD COLUMN IF NOT EXISTS "landingTitle" TEXT;
ALTER TABLE "white_label_configs" ADD COLUMN IF NOT EXISTS "landingSubtitle" TEXT;
ALTER TABLE "white_label_configs" ADD COLUMN IF NOT EXISTS "termsContent" TEXT;
ALTER TABLE "white_label_configs" ADD COLUMN IF NOT EXISTS "privacyContent" TEXT;
ALTER TABLE "white_label_configs" ADD COLUMN IF NOT EXISTS "feeOverrideMinor" INTEGER;
ALTER TABLE "white_label_configs" ADD COLUMN IF NOT EXISTS "feeDueSince" TIMESTAMP(3);
ALTER TABLE "white_label_configs" ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMP(3);
ALTER TABLE "white_label_configs" ADD COLUMN IF NOT EXISTS "suspendedReason" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "white_label_configs_subdomain_key" ON "white_label_configs"("subdomain");

CREATE TABLE IF NOT EXISTS "platform_config" (
    "id" TEXT NOT NULL DEFAULT 'platform',
    "whiteLabelFeeMinor" INTEGER NOT NULL DEFAULT 0,
    "whiteLabelGraceDays" INTEGER NOT NULL DEFAULT 7,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_config_pkey" PRIMARY KEY ("id")
);
INSERT INTO "platform_config" ("id") VALUES ('platform') ON CONFLICT ("id") DO NOTHING;
