-- How a combined FAQ set writes its answers (length, tone, audience, language).
-- Nullable: an existing set reads back as the default style.

ALTER TABLE "knowledge_faq_sets" ADD COLUMN "style" JSONB;
