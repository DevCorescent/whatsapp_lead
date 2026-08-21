-- Custom (private) plans: a negotiated tier a super-admin builds and assigns to
-- one tenant, invisible to every self-serve billing surface.
--
-- Both columns are additive with defaults that preserve today's behaviour: every
-- existing plan is PUBLIC and unowned, so the pricing page and checkout keep
-- selling exactly what they sold before this migration ran.

CREATE TYPE "PlanVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

ALTER TABLE "plans" ADD COLUMN "visibility" "PlanVisibility" NOT NULL DEFAULT 'PUBLIC';
ALTER TABLE "plans" ADD COLUMN "ownerTenantId" TEXT;

CREATE INDEX "plans_visibility_idx" ON "plans"("visibility");
CREATE INDEX "plans_ownerTenantId_idx" ON "plans"("ownerTenantId");

-- ON DELETE SET NULL: deleting a tenant must not cascade into deleting a Plan
-- row, because subscriptions reference plans with no cascade of their own and
-- the restricted delete would abort the tenant removal entirely.
ALTER TABLE "plans"
  ADD CONSTRAINT "plans_ownerTenantId_fkey"
  FOREIGN KEY ("ownerTenantId") REFERENCES "tenants"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
