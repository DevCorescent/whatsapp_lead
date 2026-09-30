-- Customer segments: saved contact filters used as a campaign audience.
-- Idempotent, like the other migrations here.

CREATE TABLE IF NOT EXISTS "segments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "filters" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "segments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "segments_tenantId_businessId_idx" ON "segments"("tenantId", "businessId");
DO $$ BEGIN
    ALTER TABLE "segments" ADD CONSTRAINT "segments_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
