-- AddColumn: email verification fields on users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailVerifyToken" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailVerifyExpiry" TIMESTAMP(3);

-- Unique index for single-use token lookup
CREATE UNIQUE INDEX IF NOT EXISTS "users_emailVerifyToken_key" ON "users"("emailVerifyToken");

-- AddColumn: button click tracking on campaign_contacts
ALTER TABLE "campaign_contacts" ADD COLUMN IF NOT EXISTS "clickedAt" TIMESTAMP(3);
