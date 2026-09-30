-- Phase 3 (SMS via MSG91) and Phase 4 (prepaid wallet + message rates).
-- Idempotent, like the other migrations here.

DO $$ BEGIN CREATE TYPE "MessageChannel" AS ENUM ('WHATSAPP', 'SMS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "SmsType" AS ENUM ('TRANSACTIONAL', 'PROMOTIONAL', 'OTP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "RateCategory" AS ENUM ('SMS_TRANSACTIONAL', 'SMS_PROMOTIONAL', 'SMS_OTP', 'WA_MARKETING', 'WA_UTILITY', 'WA_AUTHENTICATION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "WalletTxnType" AS ENUM ('TOPUP', 'DEBIT', 'REFUND', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "channel" "MessageChannel" NOT NULL DEFAULT 'WHATSAPP',
ADD COLUMN IF NOT EXISTS "costMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "estimatedCostMinor" INTEGER,
ADD COLUMN IF NOT EXISTS "smsTemplateId" TEXT;

ALTER TABLE "campaign_contacts" ADD COLUMN IF NOT EXISTS "costMinor" INTEGER,
ADD COLUMN IF NOT EXISTS "smsMessageId" TEXT,
ADD COLUMN IF NOT EXISTS "units" INTEGER;

CREATE TABLE IF NOT EXISTS "sms_configs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'msg91',
    "authKey" TEXT,
    "senderId" TEXT,
    "dltEntityId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sms_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" "SmsType" NOT NULL DEFAULT 'TRANSACTIONAL',
    "senderId" TEXT NOT NULL,
    "dltTemplateId" TEXT NOT NULL,
    "providerTemplateId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "wallets" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "balanceMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'inr',
    "lowBalanceThresholdMinor" INTEGER NOT NULL DEFAULT 10000,
    "lowBalanceNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "wallet_transactions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "WalletTxnType" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "balanceAfterMinor" INTEGER NOT NULL,
    "description" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "idempotencyKey" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "message_rates" (
    "id" TEXT NOT NULL,
    "category" "RateCategory" NOT NULL,
    "resellerId" TEXT,
    "priceMinor" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_rates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sms_configs_tenantId_key" ON "sms_configs"("tenantId");

CREATE INDEX IF NOT EXISTS "sms_templates_tenantId_idx" ON "sms_templates"("tenantId");

CREATE UNIQUE INDEX IF NOT EXISTS "sms_templates_tenantId_name_key" ON "sms_templates"("tenantId", "name");

CREATE UNIQUE INDEX IF NOT EXISTS "wallets_tenantId_key" ON "wallets"("tenantId");

CREATE UNIQUE INDEX IF NOT EXISTS "wallet_transactions_idempotencyKey_key" ON "wallet_transactions"("idempotencyKey");

CREATE INDEX IF NOT EXISTS "wallet_transactions_tenantId_createdAt_idx" ON "wallet_transactions"("tenantId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "message_rates_category_resellerId_key" ON "message_rates"("category", "resellerId");

CREATE UNIQUE INDEX IF NOT EXISTS "campaign_contacts_smsMessageId_key" ON "campaign_contacts"("smsMessageId");

DO $$ BEGIN
    ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_smsTemplateId_fkey" FOREIGN KEY ("smsTemplateId") REFERENCES "sms_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "sms_configs" ADD CONSTRAINT "sms_configs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "sms_templates" ADD CONSTRAINT "sms_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "wallets" ADD CONSTRAINT "wallets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "message_rates" ADD CONSTRAINT "message_rates_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Platform rates have resellerId NULL, which the unique index above treats as distinct;
-- keep one platform rate per category.
CREATE UNIQUE INDEX IF NOT EXISTS "message_rates_platform_category_key" ON "message_rates"("category") WHERE "resellerId" IS NULL;
