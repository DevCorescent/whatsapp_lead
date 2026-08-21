-- Per-agent share of the workspace AI allowance.
--
-- Additive and nullable. aiCreditLimit NULL means "no personal cap", which is
-- how every existing account already behaves, so nobody is newly restricted by
-- this migration running.

ALTER TABLE "users" ADD COLUMN "aiCreditLimit" INTEGER;
ALTER TABLE "users" ADD COLUMN "aiCreditsUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "aiCreditsPeriodStart" TIMESTAMP(3);
