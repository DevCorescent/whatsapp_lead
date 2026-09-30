// ============================================================================
// MODULE : Wallet top-up via Razorpay
//
// A top-up is a Razorpay order this server creates (notes: tenantId, purpose =
// "wallet_topup"). When it is paid, `applyWalletTopup` records the payment (and
// the referring reseller's commission) and credits the wallet — in one
// transaction, keyed by the payment id, so the browser's confirmation and the
// Razorpay webhook can both call it and only the first does anything.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { recordPaymentTx } from "@/lib/billing/payments";
import { credit } from "@/lib/wallet";

/** ₹100 – ₹5,00,000 per top-up. */
export const TOPUP_MIN_MINOR = 10_000;
export const TOPUP_MAX_MINOR = 50_000_000;

export async function applyWalletTopup(p: {
  tenantId: string;
  paymentId: string;
  orderId: string | null;
  amountMinor: number;
  currency: string;
}): Promise<{ applied: boolean }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const recorded = await recordPaymentTx(tx, {
        tenantId: p.tenantId,
        provider: "razorpay",
        providerPaymentId: p.paymentId,
        orderId: p.orderId,
        amountMinor: p.amountMinor,
        currency: p.currency,
        purpose: "wallet_topup",
      });
      if (!recorded) return { applied: false };
      await credit(p.tenantId, p.amountMinor, "TOPUP", {
        idempotencyKey: `topup:${p.paymentId}`,
        description: "Wallet top-up (Razorpay)",
        referenceType: "payment",
        referenceId: p.paymentId,
      }, tx);
      return { applied: true };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { applied: false };
    throw e;
  }
}
