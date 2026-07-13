// TODO [SHALMON]: Super-admin tenant management.
//
// GET /api/admin/tenants
//   - Requires SUPER_ADMIN role (checked via middleware + session)
//   - List all tenants with: plan, userCount, msgCount this month, isActive
//   - Filters: isActive, planId, search (name/slug)
//   - Paginated (page, limit)
//
// POST /api/admin/tenants
//   - Manually provision a tenant (used for onboarding enterprise clients)
//   - Body: { name, slug, planId, ownerEmail, ownerName, ownerPassword }

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  // TODO [SHALMON]: Implement
  return NextResponse.json({ success: false, error: "Not implemented yet" }, { status: 501 });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  // TODO [SHALMON]: Implement
  return NextResponse.json({ success: false, error: "Not implemented yet" }, { status: 501 });
}
