// ============================================================================
// MODULE : White-label fee (dynamic)
//
// White-label resellers pay a monthly fee, taken from their wallet. Everything is
// set by the super admin, not hard-coded:
//   · PlatformConfig.whiteLabelFeeMinor  — the default monthly fee (0 = free);
//   · WhiteLabelConfig.feeOverrideMinor  — a different fee for one reseller;
//   · PlatformConfig.whiteLabelGraceDays — how long an unpaid fee is tolerated.
//
// Each calendar month is charged once (wallet idempotency key
// "wlfee:<tenantId>:<YYYY-MM>"). If the wallet can't cover it, the date is noted
// and the owner emailed; once the grace period passes the brand is suspended —
// the reseller and its clients see the platform brand, data untouched — and it
// is restored the moment the fee is paid (daily cron, or "Pay now").
// ============================================================================

import { prisma } from "@/lib/prisma";
import { invalidateBrandCache } from "@/lib/branding";
import { debit, formatInr } from "@/lib/wallet";

export const FEE_SUSPENSION_REASON = "White-label fee unpaid";

export async function getPlatformConfig() {
  return prisma.platformConfig.upsert({ where: { id: "platform" }, create: { id: "platform" }, update: {} });
}

/** "2026-10" for the month containing `at` (UTC). */
export function feePeriod(at: Date): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function feeKey(tenantId: string, period: string): string {
  return `wlfee:${tenantId}:${period}`;
}

export type FeeOutcome =
  | { status: "free" | "paid" | "already_paid"; feeMinor: number }
  | { status: "due"; feeMinor: number; dueSince: Date; suspended: boolean };

async function notifyOwners(tenantId: string, subject: string, message: string) {
  try {
    const owners = await prisma.user.findMany({
      where: { tenantId, role: "TENANT_OWNER", isActive: true },
      select: { email: true, name: true },
    });
    const { sendNoticeEmail } = await import("@/lib/email");
    await Promise.all(owners.map((o) => sendNoticeEmail({ to: o.email, name: o.name, subject, message }).catch(() => {})));
  } catch (e) {
    console.error("[WL FEE] notify failed", e);
  }
}

/**
 * Charge this month's fee for one white-label reseller if it isn't paid yet, and
 * apply the grace/suspension rules. Safe to call any number of times.
 */
export async function chargeWhiteLabelFee(tenantId: string, now = new Date()): Promise<FeeOutcome | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { accountType: true, resellerType: true, isActive: true, whiteLabel: true },
  });
  const config = tenant?.whiteLabel;
  if (!tenant || tenant.accountType !== "RESELLER" || tenant.resellerType !== "WHITE_LABEL" || !config) return null;

  const platform = await getPlatformConfig();
  const feeMinor = config.feeOverrideMinor ?? platform.whiteLabelFeeMinor;
  const period = feePeriod(now);

  const clearDue = async () => {
    const liftSuspension = config.suspendedReason === FEE_SUSPENSION_REASON;
    if (config.feeDueSince || liftSuspension) {
      await prisma.whiteLabelConfig.update({
        where: { tenantId },
        data: { feeDueSince: null, ...(liftSuspension && { suspendedAt: null, suspendedReason: null }) },
      });
      if (liftSuspension) invalidateBrandCache();
    }
  };

  if (feeMinor <= 0) {
    await clearDue();
    return { status: "free", feeMinor: 0 };
  }

  const paid = await debit(tenantId, feeMinor, {
    idempotencyKey: feeKey(tenantId, period),
    description: `White-label fee — ${period}`,
    referenceType: "white_label_fee",
    referenceId: period,
  });

  if (paid.ok) {
    await clearDue();
    return { status: paid.alreadyCharged ? "already_paid" : "paid", feeMinor };
  }

  // Not enough balance.
  const dueSince = config.feeDueSince ?? now;
  if (!config.feeDueSince) {
    await prisma.whiteLabelConfig.update({ where: { tenantId }, data: { feeDueSince: dueSince } });
    await notifyOwners(
      tenantId,
      "White-label fee due",
      `This month's white-label fee of ${formatInr(feeMinor)} couldn't be taken from your wallet. ` +
        `Please top up within ${platform.whiteLabelGraceDays} days to keep your branding active.`,
    );
  }

  const graceEnds = dueSince.getTime() + platform.whiteLabelGraceDays * 24 * 60 * 60 * 1000;
  let suspended = Boolean(config.suspendedAt);
  if (!config.suspendedAt && now.getTime() >= graceEnds) {
    await prisma.whiteLabelConfig.update({
      where: { tenantId },
      data: { suspendedAt: now, suspendedReason: FEE_SUSPENSION_REASON },
    });
    invalidateBrandCache();
    suspended = true;
    await notifyOwners(
      tenantId,
      "White-label branding paused",
      `Your white-label branding has been paused because the fee of ${formatInr(feeMinor)} is unpaid. ` +
        "Your clients now see the standard branding. Top up your wallet and it is restored automatically.",
    );
  }
  return { status: "due", feeMinor, dueSince, suspended };
}

/** Fee status for display: this month's fee and whether it has been paid. */
export async function whiteLabelFeeStatus(tenantId: string, now = new Date()) {
  const [platform, config] = await Promise.all([
    getPlatformConfig(),
    prisma.whiteLabelConfig.findUnique({
      where: { tenantId },
      select: { feeOverrideMinor: true, feeDueSince: true, suspendedAt: true, suspendedReason: true },
    }),
  ]);
  const feeMinor = config?.feeOverrideMinor ?? platform.whiteLabelFeeMinor;
  const period = feePeriod(now);
  const paid = feeMinor <= 0
    ? true
    : Boolean(await prisma.walletTransaction.findUnique({ where: { idempotencyKey: feeKey(tenantId, period) }, select: { id: true } }));
  return {
    period,
    feeMinor,
    isOverride: config?.feeOverrideMinor != null,
    paid,
    dueSince: config?.feeDueSince ?? null,
    graceDays: platform.whiteLabelGraceDays,
    suspended: Boolean(config?.suspendedAt),
    suspendedReason: config?.suspendedReason ?? null,
  };
}
