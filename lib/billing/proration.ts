// ============================================================================
// MODULE : Proration arithmetic for mid-period plan changes
// ============================================================================
//
// What a customer owes to move up a tier part-way through a period, and how much
// longer a cheaper tier runs when they move down. Pure functions, separate from
// the routes, because these are the numbers a customer is charged: a route that
// computes money inline is a route nobody can test without a Stripe account.
//
// Two rules decide everything here:
//
//   Upgrade  — they have already paid for the rest of this period on the old
//              plan, so they owe the difference for the unused time only:
//                  (new rate × unused fraction) − (old rate × unused fraction)
//              The period window does not move. They keep the renewal date they
//              already had, now on the better plan.
//
//   Downgrade — the unused value of the old plan is not refunded and not lost.
//              It buys time at the new, cheaper rate, so the plan changes today
//              and the period end moves out:
//                  new period = unused value ÷ new daily rate
//
// Money is handled in minor units (paise) as integers throughout. Plan.priceMonthly
// is a Float, and charging a customer a number arrived at by multiplying floats is
// how you end up billing ₹499.99999999994.

import type { Cycle } from "@/lib/billing/period";

/** Days in a billing cycle — matches resolvePeriod() so windows stay consistent. */
const CYCLE_DAYS: Record<Cycle, number> = { MONTHLY: 30, ANNUAL: 365 };
const DAY_MS = 24 * 60 * 60 * 1000;

/** Rupees (Float, as stored on Plan) to paise (integer). */
export function toMinor(amount: number): number {
  return Math.round(amount * 100);
}

/** Paise back to rupees, for display only — never for further arithmetic. */
export function toMajor(minor: number): number {
  return minor / 100;
}

/** The per-cycle list price of a plan, in minor units. */
export function planPriceMinor(
  plan: { priceMonthly: number; priceAnnual: number },
  cycle: Cycle,
): number {
  return toMinor(cycle === "ANNUAL" ? plan.priceAnnual : plan.priceMonthly);
}

/**
 * How much of the current period is still unused, as a fraction of 1.
 *
 * Clamped at both ends. A clock skew that puts `now` before the period start must
 * not produce a fraction above 1 (which would credit more than was ever paid), and
 * an expired period must not produce a negative one (which would turn a credit into
 * an extra charge on an upgrade).
 */
export function unusedFraction(periodStart: Date, periodEnd: Date, now: Date): number {
  const total = periodEnd.getTime() - periodStart.getTime();
  if (total <= 0) return 0;
  const left = periodEnd.getTime() - now.getTime();
  if (left <= 0) return 0;
  if (left >= total) return 1;
  return left / total;
}

/** The unused value of what the customer already paid for, in minor units. */
export function remainingValueMinor(opts: {
  currentPlan: { priceMonthly: number; priceAnnual: number };
  cycle: Cycle;
  periodStart: Date;
  periodEnd: Date;
  now: Date;
}): number {
  const paid = planPriceMinor(opts.currentPlan, opts.cycle);
  return Math.round(paid * unusedFraction(opts.periodStart, opts.periodEnd, opts.now));
}

/** What an upgrade costs, and the figures behind it. */
export interface UpgradeQuote {
  kind: "UPGRADE";
  /** Payable now, in minor units. Never negative. */
  amountDueMinor: number;
  /** Unused value of the current plan, credited against the new one. */
  creditMinor: number;
  /** Cost of the new plan for the unused time, before the credit. */
  grossMinor: number;
  /** The renewal date, which an upgrade does not move. */
  periodEnd: Date;
  unusedFraction: number;
}

/**
 * Price an upgrade.
 *
 * The customer pays for the remainder of the period at the difference in rates, and
 * their renewal date is untouched — they bought a window, and moving up a tier
 * changes what the window entitles them to, not when it ends.
 *
 * A zero result is legitimate and is not an error: upgrading on the last day of a
 * period, or between two plans priced the same per cycle, genuinely owes nothing.
 * The caller decides whether to skip payment for it.
 */
export function quoteUpgrade(opts: {
  currentPlan: { priceMonthly: number; priceAnnual: number };
  targetPlan: { priceMonthly: number; priceAnnual: number };
  cycle: Cycle;
  periodStart: Date;
  periodEnd: Date;
  now: Date;
}): UpgradeQuote {
  const fraction = unusedFraction(opts.periodStart, opts.periodEnd, opts.now);
  const grossMinor = Math.round(planPriceMinor(opts.targetPlan, opts.cycle) * fraction);
  const creditMinor = Math.round(planPriceMinor(opts.currentPlan, opts.cycle) * fraction);

  return {
    kind: "UPGRADE",
    // Floored at zero. A "negative charge" is a refund, and refunding here would
    // mean any customer could mint money by hopping between tiers.
    amountDueMinor: Math.max(0, grossMinor - creditMinor),
    creditMinor,
    grossMinor,
    periodEnd: opts.periodEnd,
    unusedFraction: fraction,
  };
}

/** What a downgrade grants, and the figures behind it. */
export interface DowngradeQuote {
  kind: "DOWNGRADE";
  /** Downgrades are never charged for. */
  amountDueMinor: 0;
  /** Unused value of the current plan, spent on time at the new rate. */
  creditMinor: number;
  /** When the new, cheaper period starts — immediately. */
  periodStart: Date;
  /** When it ends, after the carried-over value is converted to days. */
  periodEnd: Date;
  /** Whole days the credit buys at the new rate, for the UI to state plainly. */
  grantedDays: number;
}

/**
 * Work out the window a downgrade runs on.
 *
 * The plan changes today and the unused value of the old plan is converted into
 * time at the new rate, so nothing already paid for is lost — it simply buys more
 * days of a cheaper tier than it would have bought of the old one.
 *
 * @throws {RangeError} When the target plan is free. Free has no daily rate, so
 *   there is no number of days the credit converts into; moving to a free tier is
 *   a cancellation and belongs to that flow, where the period is left to run out.
 */
export function quoteDowngrade(opts: {
  currentPlan: { priceMonthly: number; priceAnnual: number };
  targetPlan: { priceMonthly: number; priceAnnual: number };
  cycle: Cycle;
  periodStart: Date;
  periodEnd: Date;
  now: Date;
}): DowngradeQuote {
  const targetPerCycle = planPriceMinor(opts.targetPlan, opts.cycle);
  if (targetPerCycle <= 0) {
    throw new RangeError("Cannot convert remaining value into time on a free plan");
  }

  const creditMinor = remainingValueMinor(opts);
  const perDayMinor = targetPerCycle / CYCLE_DAYS[opts.cycle];
  const days = creditMinor / perDayMinor;

  // Rounded to whole days, and never below one: a customer who downgrades with a
  // few hours left has a small credit, and an end date in the past would read as
  // an expired subscription rather than as a plan change.
  const grantedDays = Math.max(1, Math.round(days));

  return {
    kind: "DOWNGRADE",
    amountDueMinor: 0,
    creditMinor,
    periodStart: opts.now,
    periodEnd: new Date(opts.now.getTime() + grantedDays * DAY_MS),
    grantedDays,
  };
}

/** Which direction a change goes, decided on price rather than on what the UI called it. */
export type ChangeKind = "UPGRADE" | "DOWNGRADE" | "SAME";

/**
 * Classify a plan change by per-cycle price.
 *
 * Direction is derived from the two prices on the server, never taken from the
 * request: a client that could name the direction could ask for a ₹9,999 plan to
 * be treated as a downgrade and be granted it without paying.
 */
export function classifyChange(
  currentPlan: { priceMonthly: number; priceAnnual: number },
  targetPlan: { priceMonthly: number; priceAnnual: number },
  cycle: Cycle,
): ChangeKind {
  const from = planPriceMinor(currentPlan, cycle);
  const to = planPriceMinor(targetPlan, cycle);
  if (to > from) return "UPGRADE";
  if (to < from) return "DOWNGRADE";
  return "SAME";
}
