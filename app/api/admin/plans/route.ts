// TODO [SHALMON]: Plan management (SUPER_ADMIN only).
//
// GET /api/admin/plans   → list all plans with subscriber counts
// POST /api/admin/plans  → create a new plan
// PATCH /api/admin/plans/[id]  → update plan limits/pricing (affects new subscriptions only)

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const plans = await prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json({ success: true, data: plans });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  // TODO [SHALMON]: Implement with zod validation
  return NextResponse.json({ success: false, error: "Not implemented yet" }, { status: 501 });
}
