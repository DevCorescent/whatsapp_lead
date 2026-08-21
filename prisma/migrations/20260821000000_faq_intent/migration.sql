-- What a tapped FAQ said about intent, frozen at the moment of the tap.
--
-- Defaulted rather than nullable: every existing interaction predates
-- classification, and "none" is the honest reading of a question nobody had
-- marked as commercial.

ALTER TABLE "faq_interactions" ADD COLUMN "intent" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "faq_interactions" ADD COLUMN "points" INTEGER NOT NULL DEFAULT 0;
