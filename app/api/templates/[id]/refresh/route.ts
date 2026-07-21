// ROUTE : POST /api/templates/[id]/refresh — pull one template's current status
// from Meta and update it locally. Admins only.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { refreshTemplate, TemplateCredsError } from "@/lib/templates";

const EDIT_ROLES = ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"];

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, role } = session.user;
  if (!EDIT_ROLES.includes(role)) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  try {
    const { id } = await params;
    const template = await refreshTemplate(id, tenantId);
    return NextResponse.json({ success: true, data: template });
  } catch (error) {
    if (error instanceof TemplateCredsError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("[TEMPLATE REFRESH]", error);
    return NextResponse.json({ success: false, error: "Failed to refresh template" }, { status: 500 });
  }
}
