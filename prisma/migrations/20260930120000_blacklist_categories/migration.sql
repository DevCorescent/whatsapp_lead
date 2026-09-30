-- Phase 1: account blacklist, business categories, exactly-once campaign sends.
-- Idempotent (IF NOT EXISTS / guarded constraints) like the other migrations here.

-- ─── Business categories ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "business_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "business_categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "business_categories_name_key" ON "business_categories"("name");

INSERT INTO "business_categories" ("id", "name", "sortOrder") VALUES
    ('bcat_it',           'IT',           10),
    ('bcat_real_estate',  'Real Estate',  20),
    ('bcat_consultancy',  'Consultancy',  30),
    ('bcat_education',    'Education',    40),
    ('bcat_healthcare',   'Healthcare',   50),
    ('bcat_finance',      'Finance',      60),
    ('bcat_other',        'Other',        1000)
ON CONFLICT ("name") DO NOTHING;

ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;
DO $$ BEGIN
    ALTER TABLE "tenants" ADD CONSTRAINT "tenants_categoryId_fkey"
        FOREIGN KEY ("categoryId") REFERENCES "business_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Blacklist ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "blacklist_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "phone" TEXT NOT NULL,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "blacklist_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "blacklist_entries_phone_idx" ON "blacklist_entries"("phone");
CREATE UNIQUE INDEX IF NOT EXISTS "blacklist_entries_tenantId_phone_key" ON "blacklist_entries"("tenantId", "phone");
-- NULL tenantIds are distinct in the index above, so platform-wide entries need their own.
CREATE UNIQUE INDEX IF NOT EXISTS "blacklist_entries_global_phone_key" ON "blacklist_entries"("phone") WHERE "tenantId" IS NULL;

DO $$ BEGIN
    ALTER TABLE "blacklist_entries" ADD CONSTRAINT "blacklist_entries_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "blacklist_entries" ADD CONSTRAINT "blacklist_entries_createdById_fkey"
        FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Campaign sends: exactly-once claim ─────────────────────────────────────
ALTER TABLE "campaign_contacts" ADD COLUMN IF NOT EXISTS "claimedAt" TIMESTAMP(3);
