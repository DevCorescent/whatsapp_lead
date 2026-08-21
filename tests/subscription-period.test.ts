import test from "node:test";
import assert from "node:assert/strict";
import { periodError, resolvePeriod, resolveTrialEnd } from "../lib/billing/period";

const d = (iso: string) => new Date(iso);
const NOW = d("2026-08-20T00:00:00Z");

test("an existing period is inherited, not restarted", () => {
  // Re-dating the window resets the campaign and message counters that meter
  // against it, so an admin fixing the end date must not hand out a fresh month.
  const { start } = resolvePeriod({
    inputEnd: d("2027-08-20T00:00:00Z"),
    existingStart: d("2026-07-01T00:00:00Z"),
    billingCycle: "MONTHLY",
    now: NOW,
  });

  assert.equal(start.toISOString(), "2026-07-01T00:00:00.000Z");
});

test("a first subscription starts today", () => {
  const { start } = resolvePeriod({ existingStart: null, billingCycle: "MONTHLY", now: NOW });
  assert.equal(start.getTime(), NOW.getTime());
});

test("an explicit start wins over the existing one", () => {
  const { start } = resolvePeriod({
    inputStart: d("2026-09-01T00:00:00Z"),
    existingStart: d("2026-07-01T00:00:00Z"),
    billingCycle: "MONTHLY",
    now: NOW,
  });
  assert.equal(start.toISOString(), "2026-09-01T00:00:00.000Z");
});

test("the cycle decides the default end", () => {
  const monthly = resolvePeriod({ billingCycle: "MONTHLY", now: NOW });
  const annual = resolvePeriod({ billingCycle: "ANNUAL", now: NOW });

  assert.equal(Math.round((monthly.end.getTime() - NOW.getTime()) / 86_400_000), 30);
  assert.equal(Math.round((annual.end.getTime() - NOW.getTime()) / 86_400_000), 365);
});

test("a period that ends before it starts is refused", () => {
  assert.match(
    periodError(d("2026-09-01"), d("2026-08-01")) ?? "",
    /end must be after/i,
  );
});

test("a trial cannot outlive the period it belongs to", () => {
  // Rendered side by side on the billing page, so this would promise the customer
  // a trial running past the subscription that contains it.
  assert.match(
    periodError(d("2026-08-01"), d("2026-09-01"), d("2026-10-01")) ?? "",
    /inside the billing period/i,
  );
});

test("a trial cannot start before the period either", () => {
  assert.match(
    periodError(d("2026-08-01"), d("2026-09-01"), d("2026-07-01")) ?? "",
    /inside the billing period/i,
  );
});

test("a valid window reports nothing", () => {
  assert.equal(periodError(d("2026-08-01"), d("2026-09-01"), d("2026-08-15")), null);
});

test("a trial date is discarded when the status is not TRIALING", () => {
  // The admin form submits whatever is in the field regardless of the status
  // beside it, and a stale date under an ACTIVE plan reads as an expiring trial.
  assert.equal(resolveTrialEnd("ACTIVE", d("2026-09-01"), d("2026-10-01")), null);
});

test("a trial with no date given ends with the period", () => {
  const end = d("2026-10-01");
  assert.equal(resolveTrialEnd("TRIALING", null, end)?.getTime(), end.getTime());
});
