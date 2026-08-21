// ============================================================================
// MODULE : Billing audit trail
// ============================================================================
//
// Super-admin actions that change what a customer pays or what they are entitled
// to. These are the writes worth being able to reconstruct months later — "who
// gave this workspace unlimited messages, and when" — so they are recorded
// rather than left to a console.log.
//
// AuditLog.tenantId is a required FK, which shapes the signature: an action
// about a specific customer is filed against that customer, and one about the
// public catalogue is filed against the acting admin's own workspace, since
// there is no other tenant it belongs to.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type BillingAuditAction =
  | "PLAN_CREATED"
  | "PLAN_UPDATED"
  | "PLAN_DELETED"
  | "SUBSCRIPTION_ASSIGNED";

export async function recordBillingAudit(params: {
  /** The customer the action is about, or the acting admin's tenant for catalogue-wide changes. */
  tenantId: string;
  userId?: string | null;
  action: BillingAuditAction;
  resource: "plan" | "subscription";
  resourceId?: string | null;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId ?? null,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId ?? null,
        metadata: params.metadata,
      },
    });
  } catch (error) {
    // Never fail the write we are recording. A plan that saved but did not get
    // logged is a gap in the trail; a plan that refused to save because the trail
    // could not be written is an outage in the admin panel.
    console.error(`[BILLING AUDIT] Failed to record ${params.action}:`, error);
  }
}
