// ROUTE : POST /api/billing/portal — open the Stripe Customer Portal so the
// tenant can manage payment methods, invoices and their subscription. Admins only.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured, appBaseUrl } from "@/lib/stripe";

const EDIT_ROLES = ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"];

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, role } = session.user;
  if (!EDIT_ROLES.includes(role)) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  if (!isStripeConfigured()) {
    return NextResponse.json({ success: false, error: "Billing is not configured." }, { status: 400 });
  }

  try {
    const subscription = await prisma.subscription.findUnique({
      where: { tenantId },
      select: { stripeCustomerId: true },
    });
    if (!subscription?.stripeCustomerId) {
      return NextResponse.json({ success: false, error: "No billing account yet. Choose a plan first." }, { status: 400 });
    }

    const portal = await getStripe().billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${appBaseUrl()}/billing`,
    });

    return NextResponse.json({ success: true, data: { url: portal.url } });
  } catch (error) {
    console.error("[BILLING PORTAL]", error);
    return NextResponse.json({ success: false, error: "Failed to open billing portal" }, { status: 500 });
  }
}
