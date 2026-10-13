-- Add whatsappIntegrationId to campaigns
-- Allows selecting which WhatsApp number a campaign sends from.
-- NULL = use the business default (existing behaviour preserved).

ALTER TABLE "campaigns"
  ADD COLUMN "whatsappIntegrationId" TEXT;

ALTER TABLE "campaigns"
  ADD CONSTRAINT "campaigns_whatsappIntegrationId_fkey"
  FOREIGN KEY ("whatsappIntegrationId")
  REFERENCES "whatsapp_integrations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "campaigns_whatsappIntegrationId_idx" ON "campaigns"("whatsappIntegrationId");
