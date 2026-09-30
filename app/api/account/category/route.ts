// ============================================================================
// MODULE : Business category
// ROUTE  : /api/account/category
//
// METHODS
// GET    - The account's category and the active categories to choose from
// PUT    - Set (or clear, with null) the account's category
//
// ACCESS
// GET: any signed-in member. PUT: settings.manage (owner / admin).
// The list itself is managed by super admins at /api/admin/categories.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";

const putSchema = z.object({ categoryId: z.string().min(1).nullable() });

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const [tenant, categories] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: { category: { select: { id: true, name: true } } },
    }),
    prisma.businessCategory.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  return NextResponse.json({ success: true, data: { category: tenant?.category ?? null, categories } });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermission(session.user, "settings.manage");
  if (denied) return denied;

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid category" }, { status: 400 });
  const { categoryId } = parsed.data;

  if (categoryId) {
    // Only an active category can be newly chosen; one deactivated later stays on accounts
    // that already have it.
    const category = await prisma.businessCategory.findFirst({ where: { id: categoryId, isActive: true }, select: { id: true } });
    if (!category) return NextResponse.json({ success: false, error: "Category not found" }, { status: 400 });
  }

  const tenant = await prisma.tenant.update({
    where: { id: session.user.tenantId },
    data: { categoryId },
    select: { category: { select: { id: true, name: true } } },
  });
  await prisma.auditLog.create({
    data: {
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "CATEGORY_CHANGED",
      resource: "tenant",
      resourceId: session.user.tenantId,
      metadata: { categoryId },
    },
  });

  return NextResponse.json({ success: true, data: { category: tenant.category } });
}
