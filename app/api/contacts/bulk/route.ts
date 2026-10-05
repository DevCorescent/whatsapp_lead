// ============================================================================
// ROUTE : POST /api/contacts/bulk
//
// Apply one action to many contacts in the active business:
//   { action: "delete" | "restore" | "block" | "unblock" | "addTag" | "removeTag",
//     ids: string[], reason?: string, tag?: string }
//
// ACCESS (lib/contactActions#ACTION_PERMISSION)
//   delete / restore  - contacts.delete   (owners and admins by default)
//   block / unblock   - blacklist.manage
//   addTag / removeTag - contacts.manage
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBusinessScope } from "@/lib/business";
import { requirePermission } from "@/lib/permissions";
import {
  ACTION_PERMISSION,
  CONTACT_ACTIONS,
  CONTACT_ACTION_MAX,
  ContactActionError,
  applyContactAction,
} from "@/lib/contactActions";

const bodySchema = z.object({
  action: z.enum(CONTACT_ACTIONS),
  ids: z.array(z.string().min(1)).min(1, "Select at least one contact").max(CONTACT_ACTION_MAX, `At most ${CONTACT_ACTION_MAX} contacts at a time`),
  reason: z.string().trim().max(500).optional(),
  tag: z.string().trim().max(50).optional(),
});

export async function POST(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
  const { action, ids, reason, tag } = parsed.data;

  const denied = await requirePermission(scope, ACTION_PERMISSION[action]);
  if (denied) return denied;

  try {
    const result = await applyContactAction({
      tenantId: scope.tenantId,
      businessId: scope.businessId,
      ids,
      action,
      reason,
      tag,
      userId: scope.userId,
      auditTenantId: scope.tenantId,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof ContactActionError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("[CONTACTS BULK]", error);
    return NextResponse.json({ success: false, error: "Failed to update the contacts" }, { status: 500 });
  }
}
