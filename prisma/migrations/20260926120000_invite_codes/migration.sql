-- Add invite code to users and referredByCode to tenants
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "inviteCode" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "users_inviteCode_key" ON "users"("inviteCode");

ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "referredByCode" TEXT;
