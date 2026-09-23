// ROUTE : POST /api/billing/verify-payment
//
// Called by the client immediately after the Razorpay checkout modal reports
// success. Verifies the HMAC-SHA256 signature before touching the database so a
// tampered or replayed callback cannot grant a plan upgrade.
//
// Two paths:
//   planChangeId present → prorated upgrade; calls applyPlanChange.
//   planId only          → new subscription; activates the plan directly.
//
// Admins only.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyPaymentSignature } from "@/lib/razorpay";
import { applyPlanChange, PLAN_CURRENCY } from "@/lib/billing/planChange";
import { findPurchasablePlan } from "@/lib/billing/plans";

const EDIT_ROLES = ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"];

const schema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
  planId: z.string().min(1),
  planChangeId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, role } = session.user;
  if (!EDIT_ROLES.includes(role)) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId, planChangeId } = parsed.data;

  // Always verify signature first — never touch DB before this check.
  if (!verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    console.error("[BILLING VERIFY] Signature mismatch", { tenantId, razorpay_order_id });
    return NextResponse.json({ success: false, error: "Payment verification failed." }, { status: 400 });
  }

  try {
    // ── Path A: prorated plan change paid via Razorpay ─────────────────────────
    if (planChangeId) {
      const applied = await applyPlanChange(planChangeId, razorpay_payment_id);
      if (!applied.ok) {
        if (applied.reason === "not-found") {
          return NextResponse.json({ success: false, error: "Plan change not found." }, { status: 404 });
        }
        if (applied.reason === "stale") {
          return NextResponse.json(
            { success: false, error: "Your subscription changed while payment was in progress. Contact support." },
            { status: 409 },
          );
        }
        // already applied — idempotent success
      }
      const fresh = await prisma.subscription.findUnique({ where: { tenantId }, include: { plan: true } });
      return NextResponse.json({ success: true, data: { applied: true, subscription: fresh } });
    }

    // ── Path B: new subscription activated after checkout ──────────────────────
    const plan = await findPurchasablePlan(tenantId, planId);
    if (!plan) return NextResponse.json({ success: false, error: "Plan not found." }, { status: 404 });

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

    const fresh = await prisma.subscription.findUnique({ where: { tenantId }, include: { plan: true } });
    return NextResponse.json({ success: true, data: { applied: true, subscription: fresh } });
  } catch (error) {
    console.error("[BILLING VERIFY]", error);
    return NextResponse.json({ success: false, error: "Failed to activate subscription." }, { status: 500 });
  }
}
