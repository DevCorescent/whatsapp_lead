import test from "node:test";
import assert from "node:assert/strict";
import { resolvePlanScope, createPlanSchema, updatePlanSchema } from "../lib/validators/plan";
import { planOverages, type PlanCaps, type UsedCounts } from "../lib/billing/overage";

// ─── Visibility / ownership rules ─────────────────────────────────────────────

test("a public plan cannot belong to a tenant", () => {
  const result = resolvePlanScope({ visibility: "PUBLIC", ownerTenantId: "tenant_1" });

  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.error : "", /public plan cannot belong to a tenant/i);
});

test("ownership is judged against the visibility already stored, not just the patch", () => {
  // Clearing nothing and sending only an owner: legal on a row that is already
  // private, refused on one that is public.
  const onPrivate = resolvePlanScope(
    { ownerTenantId: "tenant_1" },
    { visibility: "PRIVATE", ownerTenantId: null },
  );
  const onPublic = resolvePlanScope(
    { ownerTenantId: "tenant_1" },
    { visibility: "PUBLIC", ownerTenantId: null },
  );

  assert.equal(onPrivate.ok, true);
  assert.equal(onPublic.ok, false);
});

test("a custom plan never keeps the Most Popular pin", () => {
  const result = resolvePlanScope({ visibility: "PRIVATE", isPopular: true });

  assert.equal(result.ok, true);
  assert.equal(result.ok && result.data.isPopular, false);
});

test("an unowned private plan is allowed — that is the reusable tier", () => {
  const result = resolvePlanScope({ visibility: "PRIVATE", ownerTenantId: null });
  assert.equal(result.ok, true);
});

// ─── Numeric rules ────────────────────────────────────────────────────────────

test("zero is accepted everywhere it means unlimited, and for a comped price", () => {
  const parsed = createPlanSchema.safeParse({
    name: "CUSTOM_ACME",
    displayName: "Acme",
    priceMonthly: 0,
    priceAnnual: 0,
    maxContacts: 0,
    maxMsgPerMonth: 0,
    maxAgents: 0,
    maxCampaigns: 0,
  });

  assert.equal(parsed.success, true, parsed.success ? "" : parsed.error.issues[0].message);
});

test("negative caps are still refused", () => {
  const parsed = createPlanSchema.safeParse({
    name: "BAD",
    displayName: "Bad",
    priceMonthly: 0,
    priceAnnual: 0,
    maxContacts: -1,
    maxMsgPerMonth: 0,
    maxAgents: 0,
    maxCampaigns: 0,
  });

  assert.equal(parsed.success, false);
});

test("a PATCH does not resurrect defaults for fields it left alone", () => {
  // The whole reason the update schema is built from default-free rules: parsing
  // {displayName} must not also hand back maxUploadMb: 10 and reset the plan.
  const parsed = updatePlanSchema.parse({ displayName: "Renamed" });

  assert.deepEqual(parsed, { displayName: "Renamed" });
});

// ─── Downgrade warnings ───────────────────────────────────────────────────────

const used: UsedCounts = {
  users: 12,
  contacts: 4000,
  campaigns: 3,
  storageMb: 200,
  aiCredits: 10,
  businesses: 2,
  knowledgeDocs: 5,
  messages: 900,
  templates: 4,
  quickReplies: 6,
};

const caps = (over: Partial<PlanCaps> = {}): PlanCaps => ({
  maxAgents: 100,
  maxContacts: 100000,
  maxCampaigns: 100,
  maxStorageMb: 10000,
  aiCredits: 1000,
  maxBusinesses: 50,
  maxKnowledgeDocs: 500,
  maxMsgPerMonth: 100000,
  maxTemplates: 100,
  maxQuickReplies: 100,
  ...over,
});

test("a roomier plan reports nothing", () => {
  assert.deepEqual(planOverages(used, caps()), []);
});

test("an unlimited cap is never an overage", () => {
  // 0 is the unlimited sentinel. Read literally it would report every tenant as
  // over an allowance they were just given without limit.
  assert.deepEqual(planOverages(used, caps({ maxContacts: 0, maxAgents: 0 })), []);
});

test("exceeded caps are reported with the numbers behind them", () => {
  const result = planOverages(used, caps({ maxAgents: 5, maxContacts: 1000 }));

  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((r) => [r.label, r.used, r.limit]),
    [
      ["team members", 12, 5],
      ["contacts", 4000, 1000],
    ],
  );
});

test("sitting exactly on the limit is not over it", () => {
  assert.deepEqual(planOverages(used, caps({ maxAgents: 12 })), []);
});
