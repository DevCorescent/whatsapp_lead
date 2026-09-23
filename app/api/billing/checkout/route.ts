// ROUTE : POST /api/billing/checkout — start a subscription for a plan.
//  - Free plan (price 0): assigned directly, no payment.
//  - Paid plan: creates a Razorpay order and returns {orderId, amount, currency, keyId}.
//    Client opens the Razorpay checkout modal; on success calls /api/billing/verify-payment.
// Admins only. Prevents purchasing the plan the tenant is already on.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRazorpay, isRazorpayConfigured } from "@/lib/razorpay";
import { findPurchasablePlan } from "@/lib/billing/plans";
import { PLAN_CURRENCY } from "@/lib/billing/planChange";
import { toMinor } from "@/lib/billing/proration";

const EDIT_ROLES = ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"];
const schema = z.object({ planId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, role } = session.user;
  if (!EDIT_ROLES.includes(role)) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

  try {
    const plan = await findPurchasablePlan(tenantId, parsed.data.planId);
    if (!plan) return NextResponse.json({ success: false, error: "Plan not found" }, { status: 404 });

    const current = await prisma.subscription.findUnique({ where: { tenantId } });

    if (current && current.planId === plan.id && current.status === "ACTIVE") {
      return NextResponse.json({ success: false, error: "You are already on this plan." }, { status: 400 });
    }

    // Free plan — assign directly without payment.
    if (plan.priceMonthly <= 0) {
      const now = new Date();
      const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const data = {
        planId: plan.id,
        status: "ACTIVE" as const,
        currentPeriodStart: now,
        currentPeriodEnd: end,
        cancelAtPeriodEnd: false,
        cancelledAt: null,
      };
      await prisma.subscription.upsert({
        where: { tenantId },
        create: { tenantId, ...data },
        update: data,
      });
      return NextResponse.json({ success: true, data: { orderId: null, assigned: true } });
    }

    const keyId = process.env.RAZORPAY_KEY_ID ?? "";
    const keySecret = process.env.RAZORPAY_KEY_SECRET ?? "";

    console.log("[BILLING CHECKOUT] creds check", {
      KEY_ID_set: Boolean(keyId),
      KEY_ID_prefix: keyId.slice(0, 12) || "(empty)",
      KEY_SECRET_set: Boolean(keySecret),
      KEY_SECRET_prefix: keySecret ? keySecret.slice(0, 4) + "..." : "(empty)",
      KEY_SECRET_length: keySecret.length,
      isConfigured: isRazorpayConfigured(),
    });

    if (!isRazorpayConfigured()) {
      return NextResponse.json({ success: false, error: "Billing is not configured." }, { status: 400 });
    }

    const razorpay = getRazorpay();
    const amountPaise = toMinor(plan.priceMonthly);
    const currency = PLAN_CURRENCY.toUpperCase();
    const receipt = `sub_${tenantId.slice(-8)}_${Date.now()}`;

    console.log("[BILLING CHECKOUT] creating order", { amountPaise, currency, receipt, planId: plan.id });

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency,
      receipt,
      notes: { tenantId, planId: plan.id },
    });

    console.log("[BILLING CHECKOUT] order created", { orderId: order.id, status: order.status });

    return NextResponse.json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId,
        planName: plan.displayName,
      },
    });
  } catch (error) {
    console.error("[BILLING CHECKOUT] order creation failed", {
      message: error instanceof Error ? error.message : String(error),
      // Razorpay SDK wraps API errors — log the full shape
      detail: JSON.stringify(error),
    });
    return NextResponse.json({ success: false, error: "Failed to start checkout" }, { status: 500 });
  }
}
