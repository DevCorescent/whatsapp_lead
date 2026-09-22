import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyChange,
  planPriceMinor,
  quoteDowngrade,
  quoteUpgrade,
  remainingValueMinor,
  toMinor,
  unusedFraction,
} from "../lib/billing/proration";
import { quoteChange } from "../lib/billing/planChange";

// ─────────────────────────────────────────────────────────────────────────────
// These cover the arithmetic a customer is charged on, and the refusals that stop
// a plan being handed over without payment. The route and webhook wiring around
// them needs a database and a Stripe account, so what is pinned here is every
// decision that can be decided without either.
// ─────────────────────────────────────────────────────────────────────────────

const d = (iso: string) => new Date(iso);

const STARTER = { priceMonthly: 500, priceAnnual: 5000 };
const GROWTH = { priceMonthly: 1000, priceAnnual: 10000 };
const FREE = { priceMonthly: 0, priceAnnual: 0 };

// A 30-day period, exactly half consumed.
const START = d("2026-09-01T00:00:00Z");
const END = d("2026-10-01T00:00:00Z");
const MIDPOINT = d("2026-09-16T00:00:00Z");

// ─── unusedFraction ──────────────────────────────────────────────────────────

test("unused fraction is clamped at both ends", () => {
  // Before the period started: a clock skew must not credit more than was paid.
  assert.equal(unusedFraction(START, END, d("2026-08-01T00:00:00Z")), 1);
  // After it ended: must not go negative, which would turn a credit into a charge.
  assert.equal(unusedFraction(START, END, d("2026-11-01T00:00:00Z")), 0);
  assert.equal(unusedFraction(START, END, END), 0);
  assert.equal(unusedFraction(START, END, START), 1);
});

test("a zero-length period yields no unused value rather than dividing by zero", () => {
  assert.equal(unusedFraction(START, START, START), 0);
});

// ─── Upgrade pricing ─────────────────────────────────────────────────────────

test("upgrading halfway charges the difference for the unused half", () => {
  // ₹500 → ₹1000 with half the period left: (1000 − 500) × 0.5 = ₹250.
  const q = quoteUpgrade({
    currentPlan: STARTER,
    targetPlan: GROWTH,
    cycle: "MONTHLY",
    periodStart: START,
    periodEnd: END,
    now: MIDPOINT,
  });

  assert.equal(q.amountDueMinor, toMinor(250));
  assert.equal(q.creditMinor, toMinor(250));
  assert.equal(q.grossMinor, toMinor(500));
  // The renewal date does not move: they bought a window, not a quantity.
  assert.equal(q.periodEnd.toISOString(), END.toISOString());
});

test("upgrading on day one charges the full difference", () => {
  const q = quoteUpgrade({
    currentPlan: STARTER,
    targetPlan: GROWTH,
    cycle: "MONTHLY",
    periodStart: START,
    periodEnd: END,
    now: START,
  });
  assert.equal(q.amountDueMinor, toMinor(500));
});

test("upgrading at the very end of a period costs nothing", () => {
  const q = quoteUpgrade({
    currentPlan: STARTER,
    targetPlan: GROWTH,
    cycle: "MONTHLY",
    periodStart: START,
    periodEnd: END,
    now: END,
  });
  assert.equal(q.amountDueMinor, 0);
});

test("an upgrade is never priced negative", () => {
  // Two plans where the "target" is cheaper would produce a negative difference.
  // A negative charge is a refund, and refunding here would let anyone mint money
  // by hopping between tiers.
  const q = quoteUpgrade({
    currentPlan: GROWTH,
    targetPlan: STARTER,
    cycle: "MONTHLY",
    periodStart: START,
    periodEnd: END,
    now: MIDPOINT,
  });
  assert.equal(q.amountDueMinor, 0);
});

test("annual cycles are priced from the annual rate", () => {
  const q = quoteUpgrade({
    currentPlan: STARTER,
    targetPlan: GROWTH,
    cycle: "ANNUAL",
    periodStart: START,
    periodEnd: END,
    now: MIDPOINT,
  });
  // (10000 − 5000) × 0.5 = ₹2500
  assert.equal(q.amountDueMinor, toMinor(2500));
  assert.equal(planPriceMinor(GROWTH, "ANNUAL"), toMinor(10000));
});

// ─── Downgrade entitlement ───────────────────────────────────────────────────

test("a downgrade converts unused value into days on the cheaper plan", () => {
  // ₹1000 plan, half the period left → ₹500 unused. At ₹500/30d that is 30 days.
  const q = quoteDowngrade({
    currentPlan: GROWTH,
    targetPlan: STARTER,
    cycle: "MONTHLY",
    periodStart: START,
    periodEnd: END,
    now: MIDPOINT,
  });

  assert.equal(q.amountDueMinor, 0);
  assert.equal(q.creditMinor, toMinor(500));
  assert.equal(q.grantedDays, 30);
  assert.equal(q.periodStart.toISOString(), MIDPOINT.toISOString());
  assert.equal(q.periodEnd.toISOString(), d("2026-10-16T00:00:00Z").toISOString());
});

test("a downgrade on day one carries the whole period across", () => {
  const q = quoteDowngrade({
    currentPlan: GROWTH,
    targetPlan: STARTER,
    cycle: "MONTHLY",
    periodStart: START,
    periodEnd: END,
    now: START,
  });
  // A full ₹1000 unused buys 60 days of a ₹500 plan.
  assert.equal(q.grantedDays, 60);
});

test("a downgrade with almost nothing left still grants a whole day", () => {
  // An end date in the past would read as an expired subscription rather than as
  // a plan change, which is a worse outcome than rounding a few hours up.
  const q = quoteDowngrade({
    currentPlan: GROWTH,
    targetPlan: STARTER,
    cycle: "MONTHLY",
    periodStart: START,
    periodEnd: END,
    now: d("2026-09-30T23:00:00Z"),
  });
  assert.equal(q.grantedDays, 1);
  assert.ok(q.periodEnd > q.periodStart);
});

test("a downgrade to a free plan is refused rather than divided by zero", () => {
  assert.throws(
    () =>
      quoteDowngrade({
        currentPlan: GROWTH,
        targetPlan: FREE,
        cycle: "MONTHLY",
        periodStart: START,
        periodEnd: END,
        now: MIDPOINT,
      }),
    RangeError,
  );
});

// ─── Direction is decided on the server ──────────────────────────────────────

test("direction comes from price, not from what the caller claims", () => {
  assert.equal(classifyChange(STARTER, GROWTH, "MONTHLY"), "UPGRADE");
  assert.equal(classifyChange(GROWTH, STARTER, "MONTHLY"), "DOWNGRADE");
  assert.equal(classifyChange(GROWTH, { ...GROWTH }, "MONTHLY"), "SAME");
});

test("a tampered amount cannot influence the quote", () => {
  // quoteUpgrade takes no amount from anywhere — it reads the two plans. This
  // pins that: an attacker-controlled field added to the plan object is ignored.
  const hostile = { ...GROWTH, amountDueMinor: 1, priceMonthlyOverride: 0 } as unknown as typeof GROWTH;
  const q = quoteUpgrade({
    currentPlan: STARTER,
    targetPlan: hostile,
    cycle: "MONTHLY",
    periodStart: START,
    periodEnd: END,
    now: MIDPOINT,
  });
  assert.equal(q.amountDueMinor, toMinor(250));
});

// ─── quoteChange refusals ────────────────────────────────────────────────────

const subscription = {
  planId: "plan_starter",
  billingCycle: "MONTHLY" as const,
  currentPeriodStart: START,
  currentPeriodEnd: END,
  status: "ACTIVE" as const,
};

test("moving to the plan already held is refused", () => {
  const r = quoteChange({
    subscription,
    currentPlan: STARTER,
    targetPlan: { id: "plan_starter", ...GROWTH },
    now: MIDPOINT,
  });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.refusal.reason, "same-plan");
});

test("a subscription that was never paid for earns no credit", () => {
  // The hole this closes: a TRIALING workspace on the ₹2,999 tier "downgrading" to
  // the ₹999 tier on day one had its untouched trial valued at ₹2,999, which bought
  // ninety days of a paid plan without a rupee ever changing hands. Proration credits
  // time the customer BOUGHT; a trial is not bought.
  for (const status of ["TRIALING", "PAST_DUE", "CANCELLED"] as const) {
    const r = quoteChange({
      subscription: { ...subscription, planId: "plan_growth", status },
      currentPlan: GROWTH,
      targetPlan: { id: "plan_starter", ...STARTER },
      now: START,
    });
    assert.equal(r.ok, false, `${status} should not be prorateable`);
    assert.equal(r.ok === false && r.refusal.reason, "not-active");
  }
});

test("an active subscription is still prorateable", () => {
  // The guard above must not refuse the case it exists to serve.
  const r = quoteChange({
    subscription: { ...subscription, planId: "plan_growth", status: "ACTIVE" },
    currentPlan: GROWTH,
    targetPlan: { id: "plan_starter", ...STARTER },
    now: MIDPOINT,
  });
  assert.equal(r.ok, true);
  assert.equal(r.ok === true && r.kind, "DOWNGRADE");
});

test("an expired period cannot be prorated against", () => {
  // Nothing is left to carry over, so this is a fresh purchase, not a change.
  const r = quoteChange({
    subscription,
    currentPlan: STARTER,
    targetPlan: { id: "plan_growth", ...GROWTH },
    now: d("2026-11-01T00:00:00Z"),
  });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.refusal.reason, "expired");
});

test("downgrading to free is refused and pointed at cancellation", () => {
  const r = quoteChange({
    subscription: { ...subscription, planId: "plan_growth" },
    currentPlan: GROWTH,
    targetPlan: { id: "plan_free", ...FREE },
    now: MIDPOINT,
  });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.refusal.reason, "target-free");
});

test("a same-priced switch is quoted as a zero-cost upgrade, not refused", () => {
  const r = quoteChange({
    subscription,
    currentPlan: STARTER,
    targetPlan: { id: "plan_other", ...STARTER },
    now: MIDPOINT,
  });
  assert.equal(r.ok, true);
  assert.equal(r.ok === true && r.kind, "UPGRADE");
  assert.equal(r.ok === true && r.quote.amountDueMinor, 0);
});

test("an upgrade through quoteChange carries the payable amount", () => {
  const r = quoteChange({
    subscription,
    currentPlan: STARTER,
    targetPlan: { id: "plan_growth", ...GROWTH },
    now: MIDPOINT,
  });
  assert.equal(r.ok, true);
  assert.equal(r.ok === true && r.kind, "UPGRADE");
  assert.equal(r.ok === true && r.quote.amountDueMinor, toMinor(250));
});

// ─── Money handling ──────────────────────────────────────────────────────────

test("amounts stay integer paise through fractional periods", () => {
  // 0.1 + 0.2 arithmetic on rupees is how you bill someone ₹499.99999999994.
  const credit = remainingValueMinor({
    currentPlan: { priceMonthly: 999, priceAnnual: 9990 },
    cycle: "MONTHLY",
    periodStart: START,
    periodEnd: END,
    now: d("2026-09-11T07:13:00Z"),
  });
  assert.equal(Number.isInteger(credit), true);
  assert.ok(credit > 0 && credit < toMinor(999));
});
