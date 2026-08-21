-- Which FAQ question a customer tapped in WhatsApp.
--
-- New table only; nothing existing is touched. conversationId is nullable and
-- SET NULL on delete so archiving a conversation never destroys the intent
-- signal that came out of it.

CREATE TABLE "faq_interactions" (
  "id"             TEXT NOT NULL,
  "tenantId"       TEXT NOT NULL,
  "businessId"     TEXT NOT NULL,
  "contactId"      TEXT NOT NULL,
  "conversationId" TEXT,
  "question"       TEXT NOT NULL,
  "sourceKind"     TEXT NOT NULL,
  "sourceId"       TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "faq_interactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "faq_interactions_tenantId_businessId_createdAt_idx"
  ON "faq_interactions"("tenantId", "businessId", "createdAt" DESC);
CREATE INDEX "faq_interactions_contactId_idx" ON "faq_interactions"("contactId");

ALTER TABLE "faq_interactions" ADD CONSTRAINT "faq_interactions_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "faq_interactions" ADD CONSTRAINT "faq_interactions_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "faq_interactions" ADD CONSTRAINT "faq_interactions_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "faq_interactions" ADD CONSTRAINT "faq_interactions_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
