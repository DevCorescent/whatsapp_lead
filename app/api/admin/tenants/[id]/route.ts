// TODO [SHALMON]: Super-admin single tenant management.
//
// GET /api/admin/tenants/[id]   → full tenant details + usage stats
// PATCH /api/admin/tenants/[id]
//   - Body: { isActive?, planId?, name? }
//   - Suspending a tenant (isActive: false) should invalidate all active sessions
// DELETE /api/admin/tenants/[id]  → hard delete (only for test/demo tenants)

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  // TODO [SHALMON]: Implement
  return NextResponse.json({ success: false, error: "Not implemented yet" }, { status: 501 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  // TODO [SHALMON]: Implement
  return NextResponse.json({ success: false, error: "Not implemented yet" }, { status: 501 });
}
