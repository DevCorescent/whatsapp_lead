-- One customer's journey through one chatbot flow.
--
-- New table only. The conversation columns it replaces (activeNodeId, flowVars)
-- stay exactly as they are — they remain the live session state; this is the
-- record that outlives it.

CREATE TYPE "FlowRunStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'HANDOFF');

CREATE TABLE "flow_runs" (
  "id"             TEXT NOT NULL,
  "tenantId"       TEXT NOT NULL,
  "businessId"     TEXT NOT NULL,
  "contactId"      TEXT NOT NULL,
  "conversationId" TEXT,
  "flowId"         TEXT,
  "flowName"       TEXT NOT NULL,
  "status"         "FlowRunStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "path"           JSONB NOT NULL DEFAULT '[]',
  "variables"      JSONB NOT NULL DEFAULT '{}',
  "lastNodeId"     TEXT,
  "lastNodeLabel"  TEXT,
  "startedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt"        TIMESTAMP(3),
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "flow_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "flow_runs_tenantId_businessId_startedAt_idx"
  ON "flow_runs"("tenantId", "businessId", "startedAt" DESC);
CREATE INDEX "flow_runs_flowId_status_idx" ON "flow_runs"("flowId", "status");
CREATE INDEX "flow_runs_contactId_idx" ON "flow_runs"("contactId");

ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- SET NULL, not CASCADE: deleting a flow must not delete the record of everyone
-- who went through it. flowName is denormalised for exactly this case.
ALTER TABLE "flow_runs" ADD CONSTRAINT "flow_runs_flowId_fkey"
  FOREIGN KEY ("flowId") REFERENCES "chatbot_flows"("id") ON DELETE SET NULL ON UPDATE CASCADE;
