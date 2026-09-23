// ROUTE : POST /api/templates/import — pull all templates from the connected Meta
// WABA and upsert them into the local DB. Admins only.

import { NextResponse } from "next/server";
import { getBusinessScope } from "@/lib/business";
import { importTemplatesFromMeta, TemplateCredsError } from "@/lib/templates";

const EDIT_ROLES = ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"];

export async function POST() {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { businessId, tenantId, role } = scope;
  if (!EDIT_ROLES.includes(role))
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  try {
    const result = await importTemplatesFromMeta(businessId, tenantId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof TemplateCredsError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("[TEMPLATES IMPORT]", error);
    return NextResponse.json({ success: false, error: "Failed to import templates from Meta" }, { status: 500 });
  }
}
