// ROUTE : POST /api/templates/sync — manually sync all in-review templates for
// the current tenant against Meta. Admins only. (Per-template refresh lives at
// /api/templates/[id]/refresh; this is the "Sync all" button.)

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncTenantTemplates, TemplateCredsError } from "@/lib/templates";

const EDIT_ROLES = ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"];

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, role } = session.user;
  if (!EDIT_ROLES.includes(role)) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  try {
    const result = await syncTenantTemplates(tenantId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof TemplateCredsError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("[TEMPLATES SYNC]", error);
    return NextResponse.json({ success: false, error: "Failed to sync templates" }, { status: 500 });
  }
}
