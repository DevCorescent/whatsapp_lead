// ROUTE : POST /api/billing/portal
// Razorpay does not have a customer portal equivalent. This returns a link to
// the in-app billing page instead so UI code that calls this route still works.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { appBaseUrl } from "@/lib/razorpay";

const EDIT_ROLES = ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"];

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { role } = session.user;
  if (!EDIT_ROLES.includes(role)) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  return NextResponse.json({ success: true, data: { url: `${appBaseUrl()}/billing` } });
}
