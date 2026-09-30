// ============================================================================
// MODULE : Business categories (super admin)
// ROUTE  : /api/admin/categories/[id]
//
// METHODS
// PATCH  - Rename, reorder, or (de)activate a category
// DELETE - Remove a category no account uses. One in use must be deactivated
//          instead, so accounts never silently lose their category.
//
// ACCESS : SUPER_ADMIN only.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(100_000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

async function superAdmin() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  return null;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const denied = await superAdmin();
  if (denied) return denied;
  const { id } = await params;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

  try {
    const category = await prisma.businessCategory.update({
      where: { id },
      data: parsed.data,
      select: { id: true, name: true, isActive: true, sortOrder: true },
    });
    return NextResponse.json({ success: true, data: category });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "P2025") return NextResponse.json({ success: false, error: "Category not found" }, { status: 404 });
    if (code === "P2002") return NextResponse.json({ success: false, error: "A category with that name already exists" }, { status: 409 });
    console.error("[ADMIN CATEGORIES PATCH]", e);
    return NextResponse.json({ success: false, error: "Failed to update category" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const denied = await superAdmin();
  if (denied) return denied;
  const { id } = await params;

  const inUse = await prisma.tenant.count({ where: { categoryId: id } });
  if (inUse > 0) {
    return NextResponse.json(
      { success: false, error: `${inUse} account(s) use this category — deactivate it instead` },
      { status: 409 },
    );
  }
  try {
    await prisma.businessCategory.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    if ((e as { code?: string }).code === "P2025") {
      return NextResponse.json({ success: false, error: "Category not found" }, { status: 404 });
    }
    console.error("[ADMIN CATEGORIES DELETE]", e);
    return NextResponse.json({ success: false, error: "Failed to delete category" }, { status: 500 });
  }
}
