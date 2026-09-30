// ============================================================================
// ROUTE : /api/wallet/topup
//
// POST { amountMinor }                  → create a Razorpay order for a top-up.
// PUT  { razorpay_order_id, razorpay_payment_id, razorpay_signature }
//                                       → confirm it: verify the signature, read the
//                                         amount from the order (never the browser),
//                                         credit the wallet once.
// billing.manage. The Razorpay webhook credits the same payment independently.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAccountScope } from "@/lib/accounts";
import { requirePermission } from "@/lib/permissions";
import { getRazorpay, isRazorpayConfigured, verifyPaymentSignature } from "@/lib/razorpay";
import { applyWalletTopup, TOPUP_MAX_MINOR, TOPUP_MIN_MINOR } from "@/lib/billing/walletTopup";
import { getBrandForTenant } from "@/lib/branding";
import { getWallet } from "@/lib/wallet";

const createSchema = z.object({
  amountMinor: z.number().int().min(TOPUP_MIN_MINOR, "The minimum top-up is ₹100").max(TOPUP_MAX_MINOR, "The maximum top-up is ₹5,00,000"),
});
const confirmSchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const scope = await getAccountScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermission(scope, "billing.manage");
  if (denied) return denied;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
  if (!isRazorpayConfigured()) {
    return NextResponse.json({ success: false, error: "Online payments aren't configured." }, { status: 400 });
  }

  try {
    const order = await getRazorpay().orders.create({
      amount: parsed.data.amountMinor,
      currency: "INR",
      receipt: `wal_${scope.tenantId.slice(-8)}_${Date.now()}`,
      notes: { tenantId: scope.tenantId, purpose: "wallet_topup" },
    });
    const brand = await getBrandForTenant(scope.tenantId);
    return NextResponse.json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
        brandName: brand.name,
        brandColor: brand.primaryColor,
      },
    });
  } catch (error) {
    console.error("[WALLET TOPUP] order failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Could not start the payment" }, { status: 502 });
  }
}

export async function PUT(req: NextRequest) {
  const scope = await getAccountScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermission(scope, "billing.manage");
  if (denied) return denied;

  const parsed = confirmSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid payment confirmation" }, { status: 400 });
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;

  if (!verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    return NextResponse.json({ success: false, error: "Payment verification failed." }, { status: 400 });
  }

  let order: { id: string; amount: number | string; currency: string; notes?: Record<string, string> | null };
  try {
    order = (await getRazorpay().orders.fetch(razorpay_order_id)) as unknown as typeof order;
  } catch {
    return NextResponse.json({ success: false, error: "Could not confirm the payment. Try again shortly." }, { status: 502 });
  }
  if (order.notes?.tenantId !== scope.tenantId || order.notes?.purpose !== "wallet_topup") {
    return NextResponse.json({ success: false, error: "Payment verification failed." }, { status: 400 });
  }

  await applyWalletTopup({
    tenantId: scope.tenantId,
    paymentId: razorpay_payment_id,
    orderId: order.id,
    amountMinor: Number(order.amount),
    currency: order.currency ?? "INR",
  });
  const wallet = await getWallet(scope.tenantId);
  return NextResponse.json({ success: true, data: { balanceMinor: wallet.balanceMinor } });
}
