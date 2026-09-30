// ============================================================================
// MODULE : Business categories (super admin)
// ROUTE  : /api/admin/categories
//
// METHODS
// GET    - Every category, active or not, with how many accounts use it
// POST   - Add a category
//
// ACCESS : SUPER_ADMIN only.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
});

async function superAdmin() {
  const session = await auth();
  if (!session?.user) return { error: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
  if (session.user.role !== "SUPER_ADMIN") return { error: NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }) };
  return { session };
}

export async function GET() {
  const { error } = await superAdmin();
  if (error) return error;

  const categories = await prisma.businessCategory.findMany({
    select: { id: true, name: true, isActive: true, sortOrder: true, _count: { select: { tenants: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({
    success: true,
    data: categories.map(({ _count, ...c }) => ({ ...c, accounts: _count.tenants })),
  });
}

export async function POST(req: NextRequest) {
  const { error } = await superAdmin();
  if (error) return error;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

  try {
    const category = await prisma.businessCategory.create({
      data: { name: parsed.data.name, sortOrder: parsed.data.sortOrder ?? 500 },
      select: { id: true, name: true, isActive: true, sortOrder: true },
    });
    return NextResponse.json({ success: true, data: { ...category, accounts: 0 } }, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return NextResponse.json({ success: false, error: "A category with that name already exists" }, { status: 409 });
    }
    console.error("[ADMIN CATEGORIES POST]", e);
    return NextResponse.json({ success: false, error: "Failed to create category" }, { status: 500 });
  }
}
