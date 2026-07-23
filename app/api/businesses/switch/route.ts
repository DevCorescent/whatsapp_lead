// ============================================================================
// ROUTE  : /api/businesses/switch
// POST   - Switch the active business for the signed-in user.
//
// The selection is stored in an httpOnly cookie and re-validated against the
// tenant on every request (see lib/business.ts), so this endpoint only has to
// confirm the target business belongs to the caller's tenant before writing it.
// The client invalidates its React Query cache after a 200 so the whole CRM
// (inbox, contacts, campaigns, …) re-fetches under the new business.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CURRENT_BUSINESS_COOKIE, BUSINESS_COOKIE_MAX_AGE } from "@/lib/business";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  let body: { businessId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const businessId = body.businessId;
  if (!businessId) {
    return NextResponse.json({ success: false, error: "businessId is required" }, { status: 400 });
  }

  // A user may only switch to a business their own tenant owns.
  const business = await prisma.business.findFirst({
    where: { id: businessId, tenantId: session.user.tenantId },
    select: { id: true },
  });
  if (!business) {
    return NextResponse.json({ success: false, error: "Business not found" }, { status: 404 });
  }

  const res = NextResponse.json({ success: true, currentBusinessId: business.id });
  res.cookies.set(CURRENT_BUSINESS_COOKIE, business.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: BUSINESS_COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
