// ROUTE : POST /api/billing/resume — undo a scheduled cancellation. Admins only.
// Refuses when the subscription is not actually scheduled to cancel.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const EDIT_ROLES = ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"];

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, role } = session.user;
  if (!EDIT_ROLES.includes(role)) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  try {
    const sub = await prisma.subscription.findUnique({ where: { tenantId } });
    if (!sub) return NextResponse.json({ success: false, error: "No subscription to resume." }, { status: 400 });
    if (!sub.cancelAtPeriodEnd) {
      return NextResponse.json({ success: false, error: "Subscription is not scheduled to cancel." }, { status: 400 });
    }

    await prisma.subscription.update({ where: { tenantId }, data: { cancelAtPeriodEnd: false } });

    const fresh = await prisma.subscription.findUnique({ where: { tenantId } });
    return NextResponse.json({ success: true, data: fresh });
  } catch (error) {
    console.error("[BILLING RESUME]", error);
    return NextResponse.json({ success: false, error: "Failed to resume subscription" }, { status: 500 });
  }
}
