// ============================================================================
// MODULE : Billing period arithmetic for hand-assigned plans
// ============================================================================
//
// The rules that decide what window a manually assigned subscription runs on.
// Pure and separate from the route because these are the decisions that go wrong
// quietly: a period that silently restarts hands a workspace a second month of
// campaigns, and a trial date that outlives its period is rendered to the
// customer as a promise nobody can keep.

const DAY_MS = 24 * 60 * 60 * 1000;

export type Cycle = "MONTHLY" | "ANNUAL";

/**
 * The window the subscription should run on.
 *
 * Start defaults to the EXISTING start, not to today. Campaigns and messages are
 * metered from this date, so re-dating it on every plan change would reset those
 * counters and hand the tenant a fresh allowance each time an admin touched the
 * record — including when they were only fixing a typo in the end date. An admin
 * who does want a fresh window says so by passing one.
 *
 * End defaults to one cycle from the start, so the common case — "put them on
 * this plan for a year" — needs one field, not two.
 */
export function resolvePeriod(opts: {
  inputStart?: Date;
  inputEnd?: Date;
  existingStart?: Date | null;
  billingCycle: Cycle;
  now: Date;
}): { start: Date; end: Date } {
  const start = opts.inputStart ?? opts.existingStart ?? opts.now;
  const end =
    opts.inputEnd ?? new Date(start.getTime() + (opts.billingCycle === "ANNUAL" ? 365 : 30) * DAY_MS);
  return { start, end };
}

/**
 * Why this window cannot be saved, or null when it can.
 *
 * Returns a sentence rather than a boolean because it goes straight to the admin
 * as the 400, and "invalid period" would leave them guessing which of the three
 * dates was the problem.
 */
export function periodError(start: Date, end: Date, trialEndsAt?: Date | null): string | null {
  if (end <= start) return "Period end must be after period start";
  if (trialEndsAt && (trialEndsAt > end || trialEndsAt < start)) {
    return "The trial must end inside the billing period";
  }
  return null;
}

/**
 * The trial date to store.
 *
 * Cleared unless the subscription is actually TRIALING. A leftover trial date
 * under an ACTIVE subscription reads as "their trial expires next week" to
 * everyone who sees it, which is the opposite of what it means — and the admin
 * form submits whatever is in the field regardless of the status beside it.
 */
export function resolveTrialEnd(
  status: string,
  trialEndsAt: Date | null | undefined,
  end: Date,
): Date | null {
  if (status !== "TRIALING") return null;
  return trialEndsAt ?? end;
}
