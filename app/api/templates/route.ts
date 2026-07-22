// ============================================================================
// MODULE : Message Templates
// ROUTE  : /api/templates
//
// GET  - List the tenant's templates (optional ?status= filter, e.g. APPROVED
//        for the campaign template picker). Any authenticated tenant member.
// POST - Create a DRAFT template. Admins only.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";
import { createTemplateSchema } from "@/lib/validators/templates";
import { validateTemplateName, validatePlaceholders } from "@/lib/templates";

const EDIT_ROLES = ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"];

export async function GET(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { businessId } = scope;

  try {
    const status = new URL(req.url).searchParams.get("status") ?? undefined;
    const templates = await prisma.messageTemplate.findMany({
      where: { businessId, ...(status && { status }) },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, data: templates });
  } catch (error) {
    console.error("[TEMPLATES GET]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch templates" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, businessId, role } = scope;
  if (!EDIT_ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

    const parsed = createTemplateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    const data = parsed.data;

    // Meta naming + placeholder rules — surfaced now so the draft is submittable.
    const nameError = validateTemplateName(data.name);
    if (nameError) return NextResponse.json({ success: false, error: nameError }, { status: 400 });
    const placeholderError = validatePlaceholders(data.body, data.variables);
    if (placeholderError) return NextResponse.json({ success: false, error: placeholderError }, { status: 400 });

    // Names are unique per business (Meta also enforces this on the WABA).
    const existing = await prisma.messageTemplate.findFirst({ where: { name: data.name, businessId } });
    if (existing) return NextResponse.json({ success: false, error: "A template with this name already exists" }, { status: 409 });

    const template = await prisma.messageTemplate.create({
      data: {
        tenantId,
        businessId,
        name: data.name,
        category: data.category,
        language: data.language,
        body: data.body,
        status: "DRAFT",
        variables: data.variables,
        ...(data.headerType && { headerType: data.headerType }),
        ...(data.headerContent && { headerContent: data.headerContent }),
        ...(data.footer && { footer: data.footer }),
        ...(data.buttons && { buttons: data.buttons }),
      },
    });

    return NextResponse.json({ success: true, data: template }, { status: 201 });
  } catch (error) {
    console.error("[TEMPLATES POST]", error);
    return NextResponse.json({ success: false, error: "Failed to create template" }, { status: 500 });
  }
}
