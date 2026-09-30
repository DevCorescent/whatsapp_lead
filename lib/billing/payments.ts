// ============================================================================
// MODULE : Payment ledger + reseller commission
//
// Every confirmed payment is written here once, keyed by the provider's payment
// id (unique). Callers use `created` to decide whether to apply the payment's
// effect: a second delivery of the same payment — the browser's verify call and
// the webhook both firing, or a replayed request — finds the row already there
// and must not extend a subscription again.
//
// When the paying account was referred by a reseller with a commission rate, the
// reseller's commission is recorded in the same transaction, so a payment can
// never exist without its commission or be commissioned twice.
// ============================================================================

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface PaymentInput {
  tenantId: string;
  provider: "razorpay" | "stripe";
  providerPaymentId: string;
  orderId?: string | null;
  amountMinor: number;
  currency: string;
  purpose: "subscription" | "plan_change" | "renewal" | "wallet_topup";
  planId?: string | null;
}

/** Commission on an amount at a percentage rate, in whole minor units. */
export function commissionFor(amountMinor: number, ratePercent: number): number {
  if (!(ratePercent > 0) || !(amountMinor > 0)) return 0;
  return Math.round((amountMinor * Math.min(ratePercent, 100)) / 100);
}

/**
 * Record a payment (and its reseller commission) inside an existing transaction.
 * Returns false when this payment was already recorded.
 */
export async function recordPaymentTx(tx: Prisma.TransactionClient, input: PaymentInput): Promise<boolean> {
  const existing = await tx.payment.findUnique({
    where: { providerPaymentId: input.providerPaymentId },
    select: { id: true },
  });
  if (existing) return false;

  const payment = await tx.payment.create({
    data: {
      tenantId: input.tenantId,
      provider: input.provider,
      providerPaymentId: input.providerPaymentId,
      orderId: input.orderId ?? null,
      amountMinor: Math.max(0, Math.round(input.amountMinor)),
      currency: input.currency.toLowerCase(),
      purpose: input.purpose,
      planId: input.planId ?? null,
    },
  });

  const client = await tx.tenant.findUnique({
    where: { id: input.tenantId },
    select: { accountType: true, referredById: true },
  });
  if (client?.accountType !== "CLIENT" || !client.referredById) return true;

  const reseller = await tx.tenant.findFirst({
    where: { id: client.referredById, accountType: "RESELLER" },
    select: { id: true, commissionRate: true },
  });
  const rate = reseller?.commissionRate ?? 0;
  const amount = commissionFor(payment.amountMinor, rate);
  if (!reseller || amount <= 0) return true;

  await tx.resellerCommission.create({
    data: {
      resellerId: reseller.id,
      clientId: input.tenantId,
      paymentId: payment.id,
      baseMinor: payment.amountMinor,
      amountMinor: amount,
      rate,
      currency: payment.currency,
    },
  });
  return true;
}

/**
 * Record a payment on its own. A concurrent duplicate insert (two deliveries at the
 * same moment) loses on the unique index and is reported as "already recorded".
 */
export async function recordPayment(input: PaymentInput): Promise<boolean> {
  try {
    return await prisma.$transaction((tx) => recordPaymentTx(tx, input));
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return false;
    throw e;
  }
}
