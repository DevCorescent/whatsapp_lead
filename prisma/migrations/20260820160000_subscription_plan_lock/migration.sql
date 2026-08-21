-- Protect a hand-assigned custom plan from being overwritten by Stripe.
--
-- Additive and nullable: every existing subscription stays unlocked, so Stripe
-- keeps owning the plan for everyone who is actually billed through it.

ALTER TABLE "subscriptions" ADD COLUMN "planLockedAt" TIMESTAMP(3);
