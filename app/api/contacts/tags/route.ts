// ============================================================================
// ROUTE : GET /api/contacts/tags
//
// The active business's tags, with how many (non-deleted) contacts carry each.
// For the Contacts filter and the bulk "Add tag" picker. contacts.view.
// ============================================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";
import { requirePermission } from "@/lib/permissions";

export async function GET() {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermission(scope, "contacts.view");
  if (denied) return denied;

  const tags = await prisma.tag.findMany({
    where: { tenantId: scope.tenantId, businessId: scope.businessId },
    select: {
      id: true,
      name: true,
      color: true,
      _count: { select: { contacts: { where: { contact: { isBlocked: false } } } } },
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({
    success: true,
    data: tags.map(({ _count, ...t }) => ({ ...t, count: _count.contacts })),
  });
}
