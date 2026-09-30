-- Remove SMS (MSG91) — the product is WhatsApp-only. The wallet and WhatsApp
-- message rates stay. Idempotent, like the other migrations here.

-- SMS campaigns (and, by cascade, their recipients) go with the channel.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campaigns' AND column_name = 'channel') THEN
    DELETE FROM "campaigns" WHERE "channel"::text = 'SMS';
  END IF;
END $$;

ALTER TABLE "campaigns" DROP CONSTRAINT IF EXISTS "campaigns_smsTemplateId_fkey";
ALTER TABLE "campaigns" DROP COLUMN IF EXISTS "channel";
ALTER TABLE "campaigns" DROP COLUMN IF EXISTS "smsTemplateId";

DROP INDEX IF EXISTS "campaign_contacts_smsMessageId_key";
ALTER TABLE "campaign_contacts" DROP COLUMN IF EXISTS "smsMessageId";
ALTER TABLE "campaign_contacts" DROP COLUMN IF EXISTS "units";

DROP TABLE IF EXISTS "sms_templates";
DROP TABLE IF EXISTS "sms_configs";

DROP TYPE IF EXISTS "MessageChannel";
DROP TYPE IF EXISTS "SmsType";

-- RateCategory loses its SMS values: drop SMS rates, then rebuild the enum.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'RateCategory' AND e.enumlabel = 'SMS_TRANSACTIONAL'
  ) THEN
    DELETE FROM "message_rates" WHERE "category"::text LIKE 'SMS\_%';
    ALTER TYPE "RateCategory" RENAME TO "RateCategory_old";
    CREATE TYPE "RateCategory" AS ENUM ('WA_MARKETING', 'WA_UTILITY', 'WA_AUTHENTICATION');
    ALTER TABLE "message_rates" ALTER COLUMN "category" TYPE "RateCategory" USING "category"::text::"RateCategory";
    DROP TYPE "RateCategory_old";
  END IF;
END $$;
