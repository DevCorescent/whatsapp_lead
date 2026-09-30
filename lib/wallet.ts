// ============================================================================
// MODULE : Wallet — prepaid message credit
//
// The plan pays for the software; the wallet pays for messages. Balances and
// prices are whole paise (integers — never floats for money).
//
// Pricing (MessageRate): a platform rate per WhatsApp template category
// (marketing / utility / authentication), optionally overridden by a reseller for
// its own clients (never below the platform rate). A category with no rate is
// free, exactly as before the wallet existed.
//
// Charging happens at send time, one message at a time, keyed by recipient so a
// retried send is never charged twice. A message that finally fails to send is
// refunded; one the provider accepted is not (operators bill on submission).
// When the balance can't cover the next message the campaign pauses; topping up
// and pressing Resume carries on where it stopped.
// ============================================================================

import type { Prisma, RateCategory, WalletTxnType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const RATE_CATEGORIES: RateCategory[] = ["WA_MARKETING", "WA_UTILITY", "WA_AUTHENTICATION"];

/** A WhatsApp template's Meta category → its rate category. */
export function whatsappCategory(templateCategory: string | null | undefined): RateCategory {
  const c = (templateCategory ?? "").toUpperCase();
  return c === "AUTHENTICATION" ? "WA_AUTHENTICATION" : c === "UTILITY" ? "WA_UTILITY" : "WA_MARKETING";
}

/**
 * Price per unit for this account, in paise, or null when no rate is set. A client
 * of a reseller pays the reseller's rate when it set one, else the platform's.
 */
export async function rateFor(tenantId: string, category: RateCategory): Promise<number | null> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { parentId: true } });
  const rows = await prisma.messageRate.findMany({
    where: {
      category,
      OR: [{ resellerId: null }, ...(tenant?.parentId ? [{ resellerId: tenant.parentId }] : [])],
    },
    select: { resellerId: true, priceMinor: true },
  });
  const reseller = rows.find((r) => r.resellerId);
  const platform = rows.find((r) => !r.resellerId);
  return reseller?.priceMinor ?? platform?.priceMinor ?? null;
}

/** The account's wallet, created empty on first use. */
export async function getWallet(tenantId: string) {
  return prisma.wallet.upsert({ where: { tenantId }, create: { tenantId }, update: {} });
}

interface TxnMeta {
  description?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  createdById?: string | null;
  /** Makes this change happen at most once. */
  idempotencyKey?: string | null;
}

export type DebitResult =
  | { ok: true; balanceAfterMinor: number; alreadyCharged: boolean }
  | { ok: false; reason: "insufficient"; balanceMinor: number };

/**
 * Take `amountMinor` from the wallet, atomically and never below zero.
 * A repeated call with the same idempotency key is reported as already charged.
 */
export async function debit(
  tenantId: string,
  amountMinor: number,
  meta: TxnMeta,
  type: Extract<WalletTxnType, "DEBIT" | "ADJUSTMENT"> = "DEBIT",
): Promise<DebitResult> {
  if (amountMinor <= 0) {
    const w = await getWallet(tenantId);
    return { ok: true, balanceAfterMinor: w.balanceMinor, alreadyCharged: false };
  }
  await getWallet(tenantId);
  try {
    return await prisma.$transaction(async (tx) => {
      if (meta.idempotencyKey) {
        const prior = await tx.walletTransaction.findUnique({ where: { idempotencyKey: meta.idempotencyKey } });
        if (prior) return { ok: true as const, balanceAfterMinor: prior.balanceAfterMinor, alreadyCharged: true };
      }
      // The condition is the lock: two concurrent debits can't both pass on the same balance.
      const taken = await tx.wallet.updateMany({
        where: { tenantId, balanceMinor: { gte: amountMinor } },
        data: { balanceMinor: { decrement: amountMinor } },
      });
      if (taken.count === 0) {
        const w = await tx.wallet.findUnique({ where: { tenantId }, select: { balanceMinor: true } });
        return { ok: false as const, reason: "insufficient" as const, balanceMinor: w?.balanceMinor ?? 0 };
      }
      const w = await tx.wallet.findUniqueOrThrow({ where: { tenantId }, select: { balanceMinor: true } });
      await tx.walletTransaction.create({
        data: { tenantId, type, amountMinor: -amountMinor, balanceAfterMinor: w.balanceMinor, ...meta },
      });
      return { ok: true as const, balanceAfterMinor: w.balanceMinor, alreadyCharged: false };
    });
  } catch (e) {
    // A concurrent call with the same key won the race — it charged; this one didn't.
    if ((e as { code?: string }).code === "P2002" && meta.idempotencyKey) {
      const prior = await prisma.walletTransaction.findUnique({ where: { idempotencyKey: meta.idempotencyKey } });
      if (prior) return { ok: true, balanceAfterMinor: prior.balanceAfterMinor, alreadyCharged: true };
    }
    throw e;
  }
}

/** Add credit (top-up, refund, adjustment, transfer in). Idempotent when keyed. */
export async function credit(
  tenantId: string,
  amountMinor: number,
  type: Extract<WalletTxnType, "TOPUP" | "REFUND" | "ADJUSTMENT" | "TRANSFER_IN">,
  meta: TxnMeta,
  tx?: Prisma.TransactionClient,
): Promise<{ credited: boolean; balanceAfterMinor: number }> {
  const run = async (t: Prisma.TransactionClient) => {
    if (meta.idempotencyKey) {
      const prior = await t.walletTransaction.findUnique({ where: { idempotencyKey: meta.idempotencyKey } });
      if (prior) return { credited: false, balanceAfterMinor: prior.balanceAfterMinor };
    }
    const w = await t.wallet.upsert({
      where: { tenantId },
      create: { tenantId, balanceMinor: amountMinor },
      // A credit re-arms the low-balance alert.
      update: { balanceMinor: { increment: amountMinor }, lowBalanceNotifiedAt: null },
    });
    await t.walletTransaction.create({
      data: { tenantId, type, amountMinor, balanceAfterMinor: w.balanceMinor, ...meta },
    });
    return { credited: true, balanceAfterMinor: w.balanceMinor };
  };
  return tx ? run(tx) : prisma.$transaction(run);
}

/**
 * Manual correction by the platform: positive adds credit, negative removes it
 * (never below zero).
 */
export async function adjust(tenantId: string, amountMinor: number, meta: TxnMeta) {
  if (amountMinor >= 0) return credit(tenantId, amountMinor, "ADJUSTMENT", meta);
  const r = await debit(tenantId, -amountMinor, meta, "ADJUSTMENT");
  if (!r.ok) throw new WalletError(`The wallet only has ${formatInr(r.balanceMinor)}`);
  return { credited: false, balanceAfterMinor: r.balanceAfterMinor };
}

export class WalletError extends Error {}

/** Move credit from one account's wallet to another's (a reseller funding its client). */
export async function transfer(fromTenantId: string, toTenantId: string, amountMinor: number, meta: TxnMeta) {
  if (amountMinor <= 0) throw new WalletError("Enter an amount above zero");
  await Promise.all([getWallet(fromTenantId), getWallet(toTenantId)]);
  return prisma.$transaction(async (tx) => {
    const taken = await tx.wallet.updateMany({
      where: { tenantId: fromTenantId, balanceMinor: { gte: amountMinor } },
      data: { balanceMinor: { decrement: amountMinor } },
    });
    if (taken.count === 0) throw new WalletError("Not enough balance to transfer");
    const from = await tx.wallet.findUniqueOrThrow({ where: { tenantId: fromTenantId }, select: { balanceMinor: true } });
    await tx.walletTransaction.create({
      data: {
        tenantId: fromTenantId, type: "TRANSFER_OUT", amountMinor: -amountMinor, balanceAfterMinor: from.balanceMinor,
        description: meta.description, referenceType: "tenant", referenceId: toTenantId, createdById: meta.createdById,
      },
    });
    const to = await credit(toTenantId, amountMinor, "TRANSFER_IN", {
      description: meta.description, referenceType: "tenant", referenceId: fromTenantId, createdById: meta.createdById,
    }, tx);
    return { fromBalanceMinor: from.balanceMinor, toBalanceMinor: to.balanceAfterMinor };
  });
}

export function formatInr(minor: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(minor / 100);
}

/**
 * Email the account's owners once when the balance drops under their threshold.
 * Re-armed by the next credit. Best-effort: never fails a send.
 */
export async function maybeAlertLowBalance(tenantId: string): Promise<void> {
  try {
    const claimed = await prisma.wallet.findUnique({
      where: { tenantId },
      select: { balanceMinor: true, lowBalanceThresholdMinor: true, lowBalanceNotifiedAt: true },
    });
    if (!claimed || claimed.lowBalanceNotifiedAt || claimed.balanceMinor >= claimed.lowBalanceThresholdMinor) return;
    const marked = await prisma.wallet.updateMany({
      where: { tenantId, lowBalanceNotifiedAt: null },
      data: { lowBalanceNotifiedAt: new Date() },
    });
    if (marked.count === 0) return;

    const [owners, tenant] = await Promise.all([
      prisma.user.findMany({ where: { tenantId, role: "TENANT_OWNER", isActive: true }, select: { email: true, name: true } }),
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    ]);
    const { sendLowBalanceEmail } = await import("@/lib/email");
    const { getBrandForTenant } = await import("@/lib/branding");
    const brand = await getBrandForTenant(tenantId);
    await Promise.all(
      owners.map((o) =>
        sendLowBalanceEmail({
          to: o.email,
          name: o.name,
          tenantName: tenant?.name ?? "your account",
          balance: formatInr(claimed.balanceMinor),
          walletUrl: `${brand.baseUrl}/wallet`,
          brand: { name: brand.name, color: brand.primaryColor, replyTo: brand.supportEmail },
        }).catch((e) => console.error("[WALLET] low-balance email failed", e)),
      ),
    );
  } catch (e) {
    console.error("[WALLET] low-balance check failed", e);
  }
}
