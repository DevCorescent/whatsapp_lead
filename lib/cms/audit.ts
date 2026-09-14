// ============================================================================
// MODULE : Website CMS — audit trail
// ============================================================================
//
// Who changed what the public website says, and when. Filed against the acting
// admin's own tenant, because AuditLog.tenantId is a required FK and website
// content belongs to no customer (the same rule lib/billing/audit.ts follows for
// catalogue-wide plan changes).

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type CmsAuditAction = "CMS_SECTION_UPDATED" | "CMS_SECTION_RESET";

export async function recordCmsAudit(params: {
  tenantId: string;
  userId?: string | null;
  action: CmsAuditAction;
  sectionKey: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId ?? null,
        action: params.action,
        resource: "cms_section",
        resourceId: params.sectionKey,
        metadata: params.metadata,
      },
    });
  } catch (error) {
    // The content saved; a missing trail entry must not turn that into an error.
    console.error(`[CMS AUDIT] Failed to record ${params.action}:`, error);
  }
}
