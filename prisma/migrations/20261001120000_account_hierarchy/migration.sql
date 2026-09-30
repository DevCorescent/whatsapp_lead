-- Phase 2: account hierarchy (platform → reseller → client), white-label branding,
-- payment ledger + reseller commission, and configurable role permissions.
-- Idempotent, like the other migrations here.

-- ─── Enums ──────────────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "AccountType" AS ENUM ('PLATFORM', 'RESELLER', 'CLIENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ResellerType" AS ENUM ('NORMAL', 'WHITE_LABEL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Tenants: hierarchy columns ─────────────────────────────────────────────
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "accountType" "AccountType" NOT NULL DEFAULT 'CLIENT';
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "resellerType" "ResellerType";
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "parentId" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "referredById" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "commissionRate" DOUBLE PRECISION;
CREATE INDEX IF NOT EXISTS "tenants_parentId_idx" ON "tenants"("parentId");
CREATE INDEX IF NOT EXISTS "tenants_referredById_idx" ON "tenants"("referredById");

DO $$ BEGIN
    ALTER TABLE "tenants" ADD CONSTRAINT "tenants_parentId_fkey"
        FOREIGN KEY ("parentId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "tenants" ADD CONSTRAINT "tenants_referredById_fkey"
        FOREIGN KEY ("referredById") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Existing data: the account(s) that hold super-admin users run the platform; every other
-- existing account is a direct client (the column default).
UPDATE "tenants" SET "accountType" = 'PLATFORM'
WHERE "id" IN (SELECT DISTINCT "tenantId" FROM "users" WHERE "role" = 'SUPER_ADMIN');

-- ─── Plans: reseller-owned plans ────────────────────────────────────────────
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "resellerId" TEXT;
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "basePlanId" TEXT;
CREATE INDEX IF NOT EXISTS "plans_resellerId_idx" ON "plans"("resellerId");
DO $$ BEGIN
    ALTER TABLE "plans" ADD CONSTRAINT "plans_resellerId_fkey"
        FOREIGN KEY ("resellerId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── White-label ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "white_label_configs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#059669',
    "accentColor" TEXT,
    "domain" TEXT,
    "supportEmail" TEXT,
    "supportPhone" TEXT,
    "website" TEXT,
    "address" TEXT,
    "loginHeadline" TEXT,
    "loginSubtext" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "white_label_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "white_label_configs_tenantId_key" ON "white_label_configs"("tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "white_label_configs_domain_key" ON "white_label_configs"("domain");
DO $$ BEGIN
    ALTER TABLE "white_label_configs" ADD CONSTRAINT "white_label_configs_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Payments ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "payments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPaymentId" TEXT NOT NULL,
    "orderId" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'inr',
    "purpose" TEXT NOT NULL,
    "planId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "payments_providerPaymentId_key" ON "payments"("providerPaymentId");
CREATE INDEX IF NOT EXISTS "payments_tenantId_createdAt_idx" ON "payments"("tenantId", "createdAt");
DO $$ BEGIN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Reseller commission ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "reseller_commissions" (
    "id" TEXT NOT NULL,
    "resellerId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "baseMinor" INTEGER NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'inr',
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reseller_commissions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "reseller_commissions_paymentId_key" ON "reseller_commissions"("paymentId");
CREATE INDEX IF NOT EXISTS "reseller_commissions_resellerId_status_idx" ON "reseller_commissions"("resellerId", "status");
DO $$ BEGIN
    ALTER TABLE "reseller_commissions" ADD CONSTRAINT "reseller_commissions_resellerId_fkey"
        FOREIGN KEY ("resellerId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "reseller_commissions" ADD CONSTRAINT "reseller_commissions_clientId_fkey"
        FOREIGN KEY ("clientId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "reseller_commissions" ADD CONSTRAINT "reseller_commissions_paymentId_fkey"
        FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Role permission overrides ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "role_permissions" (
    "id" TEXT NOT NULL,
    "accountType" "AccountType" NOT NULL,
    "role" "UserRole" NOT NULL,
    "permission" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "role_permissions_accountType_role_permission_key"
    ON "role_permissions"("accountType", "role", "permission");
