// ============================================================================
// MODULE : Message Template (single)
// ROUTE  : /api/templates/[id]
//
// GET    - Load one template. Any authenticated tenant member.
// PATCH  - Edit a DRAFT/REJECTED template only. Admins only.
// DELETE - Delete a DRAFT/REJECTED/DISABLED template only. Admins only.
//
// Every query is tenant-scoped, so another workspace's template is
// indistinguishable from one that does not exist.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateTemplateSchema } from "@/lib/validators/templates";
import {
  validateTemplateName,
  validatePlaceholders,
  EDITABLE_STATUSES,
  DELETABLE_STATUSES,
} from "@/lib/templates";

const EDIT_ROLES = ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  const { id } = await params;
  const template = await prisma.messageTemplate.findFirst({ where: { id, tenantId } });
  if (!template) return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: template });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, role } = session.user;
  if (!EDIT_ROLES.includes(role)) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

  const parsed = updateTemplateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

  const template = await prisma.messageTemplate.findFirst({ where: { id, tenantId } });
  if (!template) return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });

  // Approved / in-review templates are immutable — only drafts and rejected ones edit.
  if (!EDITABLE_STATUSES.includes(template.status)) {
    return NextResponse.json(
      { success: false, error: "Only draft or rejected templates can be edited" },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const nextName = d.name ?? template.name;
  const nextBody = d.body ?? template.body;
  const nextVars = d.variables ?? template.variables;

  const nameError = validateTemplateName(nextName);
  if (nameError) return NextResponse.json({ success: false, error: nameError }, { status: 400 });
  const placeholderError = validatePlaceholders(nextBody, nextVars);
  if (placeholderError) return NextResponse.json({ success: false, error: placeholderError }, { status: 400 });

  if (d.name && d.name !== template.name) {
    const clash = await prisma.messageTemplate.findFirst({ where: { name: d.name, tenantId, id: { not: id } } });
    if (clash) return NextResponse.json({ success: false, error: "A template with this name already exists" }, { status: 409 });
  }

  try {
    const updated = await prisma.messageTemplate.update({
      where: { id },
      data: {
        ...(d.name !== undefined && { name: d.name }),
        ...(d.category !== undefined && { category: d.category }),
        ...(d.language !== undefined && { language: d.language }),
        ...(d.body !== undefined && { body: d.body }),
        ...(d.headerType !== undefined && { headerType: d.headerType }),
        ...(d.headerContent !== undefined && { headerContent: d.headerContent }),
        ...(d.footer !== undefined && { footer: d.footer }),
        ...(d.buttons !== undefined && { buttons: (d.buttons ?? Prisma.DbNull) as Prisma.InputJsonValue }),
        ...(d.variables !== undefined && { variables: d.variables }),
        // Editing a rejected template returns it to a clean DRAFT for resubmission.
        ...(template.status === "REJECTED" && { status: "DRAFT", rejectionReason: null }),
      },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[TEMPLATE PATCH]", error);
    return NextResponse.json({ success: false, error: "Failed to update template" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, role } = session.user;
  if (!EDIT_ROLES.includes(role)) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const template = await prisma.messageTemplate.findFirst({ where: { id, tenantId } });
  if (!template) return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });

  if (!DELETABLE_STATUSES.includes(template.status)) {
    return NextResponse.json(
      { success: false, error: "Approved or in-review templates cannot be deleted" },
      { status: 400 },
    );
  }

  try {
    await prisma.messageTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[TEMPLATE DELETE]", error);
    return NextResponse.json({ success: false, error: "Failed to delete template" }, { status: 500 });
  }
}
