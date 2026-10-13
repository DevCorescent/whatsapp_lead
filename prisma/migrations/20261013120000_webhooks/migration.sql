-- Add apiKey to tenant_settings for incoming API authentication
ALTER TABLE "tenant_settings" ADD COLUMN "apiKey" TEXT UNIQUE;

-- WebhookEndpoint: outgoing webhook targets
CREATE TABLE "webhook_endpoints" (
  "id"          TEXT NOT NULL,
  "tenantId"    TEXT NOT NULL,
  "url"         TEXT NOT NULL,
  "secret"      TEXT NOT NULL,
  "events"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "isActive"    BOOLEAN NOT NULL DEFAULT TRUE,
  "description" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "webhook_endpoints_tenantId_idx" ON "webhook_endpoints"("tenantId");

-- WebhookDelivery: log of outgoing webhook attempts
CREATE TABLE "webhook_deliveries" (
  "id"          TEXT NOT NULL,
  "endpointId"  TEXT NOT NULL,
  "event"       TEXT NOT NULL,
  "payload"     JSONB NOT NULL,
  "statusCode"  INTEGER,
  "response"    TEXT,
  "error"       TEXT,
  "attempts"    INTEGER NOT NULL DEFAULT 0,
  "deliveredAt" TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpointId_fkey"
  FOREIGN KEY ("endpointId") REFERENCES "webhook_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "webhook_deliveries_endpointId_createdAt_idx" ON "webhook_deliveries"("endpointId", "createdAt" DESC);
