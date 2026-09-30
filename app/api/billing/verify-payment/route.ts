// ============================================================================
// ROUTE : POST /api/billing/verify-payment
//
// The browser's confirmation of a Razorpay checkout. Activates the plan (or applies
// the prorated plan change) the payment was for, records the payment, and credits
// the referring reseller's commission.
//
// What the payment was FOR is read from the Razorpay order this server created —
// its notes and amount — never from the request body. The body used to be trusted:
// a valid signature for a cheap plan's order could be sent with an expensive
// `planId` (or another plan change's id) and activate it, and the same payment
// could be replayed to push the period end forward a month at a time. The order
// lookup closes the first; the payment ledger's unique payment id closes the second.
// The Razorpay webhook applies the same payment independently and idempotently.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRazorpay, verifyPaymentSignature } from "@/lib/razorpay";
import { applyPlanChange, PLAN_CURRENCY } from "@/lib/billing/planChange";
import { findPurchasablePlan } from "@/lib/billing/plans";
import { toMinor } from "@/lib/billing/proration";
import { recordPayment, recordPaymentTx } from "@/lib/billing/payments";
import { requirePermission } from "@/lib/permissions";

const schema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
  // Accepted for compatibility and cross-checked against the order; never trusted on their own.
  planId: z.string().optional(),
  planChangeId: z.string().optional(),
});

interface RazorpayOrder {
  id: string;
  amount: number | string;
  currency: string;
  notes?: Record<string, string> | null;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermission(session.user, "billing.manage");
  if (denied) return denied;
  const { tenantId } = session.user;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;

  if (!verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    console.error("[BILLING VERIFY] Signature mismatch", { tenantId, razorpay_order_id });
    return NextResponse.json({ success: false, error: "Payment verification failed." }, { status: 400 });
  }

  let order: RazorpayOrder;
  try {
    order = (await getRazorpay().orders.fetch(razorpay_order_id)) as RazorpayOrder;
  } catch (error) {
    console.error("[BILLING VERIFY] Could not fetch order", { tenantId, razorpay_order_id, error: String(error) });
    return NextResponse.json({ success: false, error: "Could not confirm the payment. Try again shortly." }, { status: 502 });
  }

  const notes = order.notes ?? {};
  const orderAmount = Number(order.amount);
  if (notes.tenantId !== tenantId) {
    console.error("[BILLING VERIFY] Order belongs to another account", { tenantId, orderTenant: notes.tenantId });
    return NextResponse.json({ success: false, error: "Payment verification failed." }, { status: 400 });
  }
  const bodyMismatch =
    (parsed.data.planChangeId && parsed.data.planChangeId !== notes.planChangeId) ||
    (parsed.data.planId && !notes.planChangeId && parsed.data.planId !== notes.planId);
  if (bodyMismatch) {
    return NextResponse.json({ success: false, error: "Payment does not match this plan." }, { status: 400 });
  }

  try {
    // ── Prorated plan change ──
    if (notes.planChangeId) {
      const change = await prisma.planChange.findFirst({
        where: { id: notes.planChangeId, tenantId },
        select: { id: true, amountDueMinor: true, toPlanId: true },
      });
      if (!change) return NextResponse.json({ success: false, error: "Plan change not found." }, { status: 404 });
      if (orderAmount !== change.amountDueMinor) {
        console.error("[BILLING VERIFY] Plan change amount mismatch", { changeId: change.id, orderAmount, due: change.amountDueMinor });
        return NextResponse.json({ success: false, error: "Payment amount does not match." }, { status: 400 });
      }

      const applied = await applyPlanChange(change.id, razorpay_payment_id);
      if (!applied.ok) {
        if (applied.reason === "stale") {
          return NextResponse.json(
            { success: false, error: "Your subscription changed while payment was in progress. Contact support." },
            { status: 409 },
          );
        }
        return NextResponse.json({ success: false, error: "Plan change could not be applied." }, { status: 409 });
      }
      await recordPayment({
        tenantId,
        provider: "razorpay",
        providerPaymentId: razorpay_payment_id,
        orderId: order.id,
        amountMinor: orderAmount,
        currency: order.currency ?? PLAN_CURRENCY,
        purpose: "plan_change",
        planId: change.toPlanId,
      });
      const fresh = await prisma.subscription.findUnique({ where: { tenantId }, include: { plan: true } });
      return NextResponse.json({ success: true, data: { applied: true, subscription: fresh } });
    }

    // ── New subscription / plan purchase ──
    const plan = notes.planId ? await findPurchasablePlan(tenantId, notes.planId) : null;
    if (!plan) return NextResponse.json({ success: false, error: "Plan not found." }, { status: 404 });
    if (orderAmount !== toMinor(plan.priceMonthly)) {
      console.error("[BILLING VERIFY] Amount mismatch", { planId: plan.id, orderAmount, price: plan.priceMonthly });
      return NextResponse.json({ success: false, error: "Payment amount does not match the plan." }, { status: 400 });
    }

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

    // The payment row is the lock: only the first confirmation of this payment moves the
    // subscription. A replay (or the webhook arriving first) finds it recorded and changes nothing.
    try {
      await prisma.$transaction(async (tx) => {
        const created = await recordPaymentTx(tx, {
          tenantId,
          provider: "razorpay",
          providerPaymentId: razorpay_payment_id,
          orderId: order.id,
          amountMinor: orderAmount,
          currency: order.currency ?? PLAN_CURRENCY,
          purpose: "subscription",
          planId: plan.id,
        });
        if (!created) return;
        await tx.subscription.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data });
      });
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e;
    }

    const fresh = await prisma.subscription.findUnique({ where: { tenantId }, include: { plan: true } });
    return NextResponse.json({ success: true, data: { applied: true, subscription: fresh } });
  } catch (error) {
    console.error("[BILLING VERIFY]", error);
    return NextResponse.json({ success: false, error: "Failed to activate subscription." }, { status: 500 });
  }
}
