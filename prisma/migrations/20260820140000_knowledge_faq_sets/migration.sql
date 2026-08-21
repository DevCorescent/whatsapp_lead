-- Multi-document FAQ sets.
--
-- Purely additive: a new table, nothing touched on knowledge_docs. Per-document
-- FAQs keep living on knowledge_docs.metadata exactly as before, so every
-- document already indexed keeps the questions it was given at ingest.

CREATE TABLE "knowledge_faq_sets" (
  "id"         TEXT NOT NULL,
  "tenantId"   TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "docIds"     TEXT[],
  "faqs"       JSONB NOT NULL DEFAULT '[]',
  "truncated"  BOOLEAN NOT NULL DEFAULT false,
  "error"      TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,

  CONSTRAINT "knowledge_faq_sets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "knowledge_faq_sets_tenantId_businessId_idx"
  ON "knowledge_faq_sets"("tenantId", "businessId");

ALTER TABLE "knowledge_faq_sets"
  ADD CONSTRAINT "knowledge_faq_sets_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "knowledge_faq_sets"
  ADD CONSTRAINT "knowledge_faq_sets_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
