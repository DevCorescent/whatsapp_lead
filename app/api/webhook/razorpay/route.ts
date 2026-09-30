// ============================================================================
// ROUTE : /api/webhook/razorpay  (POST)
//
// Razorpay → app sync. Every event is signature-verified against
// RAZORPAY_WEBHOOK_SECRET over the RAW request body before any data is read.
//
// This webhook is a safety net. The primary activation path is
// /api/billing/verify-payment (called directly by the client after the modal
// succeeds). The webhook handles edge cases: tab closures, network failures, etc.
//
// Handled events:
//   payment.captured  → activate subscription (idempotent via PlanChange status)
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { applyPlanChange } from "@/lib/billing/planChange";
import { findPurchasablePlan } from "@/lib/billing/plans";
import { recordPayment, recordPaymentTx } from "@/lib/billing/payments";
import { applyWalletTopup } from "@/lib/billing/walletTopup";

export const dynamic = "force-dynamic";

function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[RAZORPAY WEBHOOK] RAZORPAY_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const signature = req.headers.get("x-razorpay-signature") ?? "";
  const rawBody = await req.text();

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.error("[RAZORPAY WEBHOOK] Signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: { event: string; payload: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    if (event.event === "payment.captured") {
      const payment = (event.payload as { payment?: { entity?: Record<string, unknown> } })?.payment?.entity;
      if (!payment) return NextResponse.json({ received: true });

      const notes = payment.notes as Record<string, string> | undefined;
      const tenantId = notes?.tenantId;
      const planChangeId = notes?.planChangeId;
      const planId = notes?.planId;
      const paymentId = payment.id as string;
      const amountMinor = Number(payment.amount ?? 0);
      const currency = String(payment.currency ?? "inr");
      const orderId = typeof payment.order_id === "string" ? payment.order_id : null;

      // Wallet top-up: credited once, whether this webhook or the browser's confirmation lands first.
      if (notes?.purpose === "wallet_topup" && tenantId) {
        await applyWalletTopup({ tenantId, paymentId, orderId, amountMinor, currency });
        return NextResponse.json({ received: true });
      }

      if (planChangeId) {
        // Prorated upgrade — apply via PlanChange row (idempotent).
        const applied = await applyPlanChange(planChangeId, paymentId);
        if (!applied.ok && applied.reason !== "not-payable") {
          console.error("[RAZORPAY WEBHOOK] Could not apply plan change", { planChangeId, reason: applied.reason });
        }
        if (applied.ok && tenantId) {
          await recordPayment({ tenantId, provider: "razorpay", providerPaymentId: paymentId, orderId, amountMinor, currency, purpose: "plan_change" });
        }
      } else if (tenantId && planId) {
        // Fresh subscription. The payment ledger decides: only the first confirmation of this
        // payment (this webhook or the browser's verify call, whichever lands first) activates
        // the plan and credits commission — a redelivery can't extend the period again.
        const plan = await findPurchasablePlan(tenantId, planId);
        if (plan) {
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
          try {
            await prisma.$transaction(async (tx) => {
              const created = await recordPaymentTx(tx, {
                tenantId, provider: "razorpay", providerPaymentId: paymentId, orderId, amountMinor, currency,
                purpose: "subscription", planId: plan.id,
              });
              if (created) await tx.subscription.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data });
            });
          } catch (e) {
            if ((e as { code?: string }).code !== "P2002") throw e;
          }
        }
      }
    }
  } catch (error) {
    console.error(`[RAZORPAY WEBHOOK] Error handling ${event.event}:`, error);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
