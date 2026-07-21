// ROUTE : POST /api/templates/[id]/duplicate — clone a template as a fresh DRAFT
// (unique name suffix, no Meta ID/status carried over). Admins only.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const EDIT_ROLES = ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"];

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, role } = session.user;
  if (!EDIT_ROLES.includes(role)) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  try {
    const { id } = await params;
    const source = await prisma.messageTemplate.findFirst({ where: { id, tenantId } });
    if (!source) return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });

    // Find a free "<name>_copy[_n]" — names are unique per tenant.
    const base = `${source.name}_copy`.slice(0, 505);
    let name = base;
    for (let i = 2; await prisma.messageTemplate.findFirst({ where: { name, tenantId } }); i++) {
      name = `${base}_${i}`;
    }

    const copy = await prisma.messageTemplate.create({
      data: {
        tenantId,
        name,
        category: source.category,
        language: source.language,
        body: source.body,
        headerType: source.headerType,
        headerContent: source.headerContent,
        footer: source.footer,
        buttons: (source.buttons ?? Prisma.DbNull) as Prisma.InputJsonValue,
        variables: source.variables,
        status: "DRAFT",
      },
    });

    return NextResponse.json({ success: true, data: copy }, { status: 201 });
  } catch (error) {
    console.error("[TEMPLATE DUPLICATE]", error);
    return NextResponse.json({ success: false, error: "Failed to duplicate template" }, { status: 500 });
  }
}
