// ROUTE : POST /api/templates/sync — manually sync all in-review templates for
// the current tenant against Meta. Admins only. (Per-template refresh lives at
// /api/templates/[id]/refresh; this is the "Sync all" button.)

import { NextResponse } from "next/server";
import { getBusinessScope } from "@/lib/business";
import { syncBusinessTemplates, TemplateCredsError } from "@/lib/templates";

const EDIT_ROLES = ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"];

export async function POST() {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { businessId, role } = scope;
  if (!EDIT_ROLES.includes(role)) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  try {
    const result = await syncBusinessTemplates(businessId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof TemplateCredsError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("[TEMPLATES SYNC]", error);
    return NextResponse.json({ success: false, error: "Failed to sync templates" }, { status: 500 });
  }
}
