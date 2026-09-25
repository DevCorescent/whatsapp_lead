-- Add headerVariables column to message_templates for header {{1}} examples
ALTER TABLE "message_templates" ADD COLUMN IF NOT EXISTS "headerVariables" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
