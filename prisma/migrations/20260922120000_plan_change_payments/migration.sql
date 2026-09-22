-- Paid plan upgrades and value-preserving downgrades.
--
-- Additive only. Two new tables and one new relation; nothing on "subscriptions",
-- "plans" or any other existing table is altered, so every current subscription
-- keeps working exactly as before and this migration is safe to run on a live
-- database with active tenants.
--
-- Written to be re-runnable: every statement is IF NOT EXISTS or guarded, so a
-- database that already received part of this via `prisma db push` converges
-- rather than erroring.

-- ─── Enums ───────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "PlanChangeKind" AS ENUM ('UPGRADE', 'DOWNGRADE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PlanChangeStatus" AS ENUM ('PENDING', 'PAID', 'APPLIED', 'FAILED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── plan_changes ────────────────────────────────────────────────────────────
--
-- One row per requested move between plans, priced on the server. The amount a
-- customer pays is written here once and re-read when the payment returns, so the
-- figure is never taken from the browser at the point of charge.

CREATE TABLE IF NOT EXISTS "plan_changes" (
  "id"                TEXT NOT NULL,
  "tenantId"          TEXT NOT NULL,
  "fromPlanId"        TEXT NOT NULL,
  "toPlanId"          TEXT NOT NULL,
  "kind"              "PlanChangeKind" NOT NULL,
  "status"            "PlanChangeStatus" NOT NULL DEFAULT 'PENDING',
  -- Money in minor units (paise). Integer, never floating point.
  "amountDueMinor"    INTEGER NOT NULL,
  "currency"          TEXT NOT NULL DEFAULT 'inr',
  "resultPeriodStart" TIMESTAMP(3) NOT NULL,
  "resultPeriodEnd"   TIMESTAMP(3) NOT NULL,
  "stripeSessionId"   TEXT,
  "stripePaymentRef"  TEXT,
  "appliedAt"         TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "plan_changes_pkey" PRIMARY KEY ("id")
);

-- One Stripe Checkout Session can settle at most one plan change. This is the
-- constraint that stops a replayed session from being applied twice.
CREATE UNIQUE INDEX IF NOT EXISTS "plan_changes_stripeSessionId_key"
  ON "plan_changes" ("stripeSessionId");

CREATE INDEX IF NOT EXISTS "plan_changes_tenantId_status_idx"
  ON "plan_changes" ("tenantId", "status");

-- Cascade: a deleted tenant takes its subscription and therefore its pending
-- plan changes with it. The FK points at subscriptions."tenantId", which carries
-- a unique constraint, so this is a one-to-many from the subscription.
DO $$ BEGIN
  ALTER TABLE "plan_changes"
    ADD CONSTRAINT "plan_changes_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "subscriptions" ("tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── processed_stripe_events ─────────────────────────────────────────────────
--
-- Stripe delivers at least once. Two handlers are not naturally idempotent:
-- resetAiUsage() would grant a second month of AI credits, and applying a plan
-- change twice would move a period end twice. The primary key is Stripe's own
-- event id, so the INSERT is itself the lock.

CREATE TABLE IF NOT EXISTS "processed_stripe_events" (
  "id"          TEXT NOT NULL,
  "type"        TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "processed_stripe_events_pkey" PRIMARY KEY ("id")
);
