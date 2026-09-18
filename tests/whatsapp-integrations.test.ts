import test from "node:test";
import assert from "node:assert/strict";
import {
  checkIntegrationOwnership,
  decideClaim,
  planDefaultAfterDisconnect,
  routeInbound,
  selectDefaultIntegration,
  shouldBecomeDefault,
  type IntegrationCandidate,
} from "../lib/whatsappIntegrationRules";

// ─────────────────────────────────────────────────────────────────────────────
// These rules decide which WhatsApp number a message is received on and sent
// from. Each case is phrased as the failure it prevents: a customer answered
// from a stranger's number, a message filed under the wrong workspace, or a
// business left with two defaults or none.
// ─────────────────────────────────────────────────────────────────────────────

const day = (n: number) => new Date(Date.UTC(2026, 8, n));

const row = (over: Partial<IntegrationCandidate> & { id: string }): IntegrationCandidate => ({
  tenantId: "tenant-a",
  businessId: "biz-1",
  isActive: true,
  isDefault: false,
  createdAt: day(1),
  ...over,
});

// ─── Ownership: never answer from another business's number ─────────────────

test("an integration of the same business is usable", () => {
  const i = row({ id: "i1" });
  assert.deepEqual(checkIntegrationOwnership(i, { businessId: "biz-1", tenantId: "tenant-a" }), {
    ok: true,
    integration: i,
  });
});

test("an integration of another business is reported as missing, not used", () => {
  const other = row({ id: "i1", businessId: "biz-2" });
  assert.deepEqual(checkIntegrationOwnership(other, { businessId: "biz-1" }), {
    ok: false,
    reason: "not-found",
  });
});

test("an integration of another tenant is reported as missing, not used", () => {
  const foreign = row({ id: "i1", tenantId: "tenant-b" });
  assert.deepEqual(checkIntegrationOwnership(foreign, { businessId: "biz-1", tenantId: "tenant-a" }), {
    ok: false,
    reason: "not-found",
  });
});

test("a disconnected number is refused rather than swapped for another one", () => {
  const off = row({ id: "i1", isActive: false });
  assert.deepEqual(checkIntegrationOwnership(off, { businessId: "biz-1" }), {
    ok: false,
    reason: "inactive",
  });
});

test("a missing row is refused", () => {
  assert.deepEqual(checkIntegrationOwnership(null, { businessId: "biz-1" }), {
    ok: false,
    reason: "not-found",
  });
});

// ─── Default sender: campaigns, templates, threads with no number ───────────

test("the flagged default is the business's sender", () => {
  const a = row({ id: "a", createdAt: day(1) });
  const b = row({ id: "b", createdAt: day(2), isDefault: true });
  assert.equal(selectDefaultIntegration([a, b])?.id, "b");
});

test("with no flagged default the oldest active number is used", () => {
  const a = row({ id: "a", createdAt: day(3) });
  const b = row({ id: "b", createdAt: day(2) });
  assert.equal(selectDefaultIntegration([a, b])?.id, "b");
});

test("a disconnected number is never the default sender, even if still flagged", () => {
  const stale = row({ id: "a", isActive: false, isDefault: true });
  const live = row({ id: "b", createdAt: day(5) });
  assert.equal(selectDefaultIntegration([stale, live])?.id, "b");
});

test("a business with only disconnected numbers has no integration sender", () => {
  assert.equal(selectDefaultIntegration([row({ id: "a", isActive: false })]), null);
});

// ─── Default on connect ──────────────────────────────────────────────────────

test("the first number of a business becomes default", () => {
  assert.equal(shouldBecomeDefault([]), true);
});

test("a second number does not take the default from the first", () => {
  assert.equal(shouldBecomeDefault([{ isActive: true, isDefault: true }]), false);
});

test("a number connected after the default was disconnected becomes default", () => {
  assert.equal(shouldBecomeDefault([{ isActive: false, isDefault: false }]), true);
});

// ─── Default on disconnect ───────────────────────────────────────────────────

test("disconnecting the default promotes the oldest remaining active number", () => {
  const all = [
    row({ id: "def", isDefault: true, createdAt: day(1) }),
    row({ id: "newer", createdAt: day(4) }),
    row({ id: "older", createdAt: day(2) }),
    row({ id: "off", isActive: false, createdAt: day(1) }),
  ];
  assert.deepEqual(planDefaultAfterDisconnect(all, "def"), { promoteId: "older" });
});

test("disconnecting the only number leaves no default", () => {
  assert.deepEqual(planDefaultAfterDisconnect([row({ id: "def", isDefault: true })], "def"), {
    promoteId: null,
  });
});

test("disconnecting a non-default number leaves the default alone", () => {
  const all = [row({ id: "def", isDefault: true }), row({ id: "x" })];
  assert.deepEqual(planDefaultAfterDisconnect(all, "x"), { promoteId: null });
});

// ─── Inbound routing by Meta's phone_number_id ───────────────────────────────

test("an active number routes to its own business and integration", () => {
  assert.deepEqual(
    routeInbound({
      id: "i1",
      tenantId: "tenant-a",
      businessId: "biz-1",
      isActive: true,
      businessTenantId: "tenant-a",
    }),
    { kind: "integration", integrationId: "i1", tenantId: "tenant-a", businessId: "biz-1" },
  );
});

test("a disconnected number is dropped, not re-attached through the legacy lookup", () => {
  assert.deepEqual(
    routeInbound({
      id: "i1",
      tenantId: "tenant-a",
      businessId: "biz-1",
      isActive: false,
      businessTenantId: "tenant-a",
    }),
    { kind: "disconnected" },
  );
});

test("a row whose business sits in another tenant is never routed on", () => {
  assert.deepEqual(
    routeInbound({
      id: "i1",
      tenantId: "tenant-a",
      businessId: "biz-1",
      isActive: true,
      businessTenantId: "tenant-b",
    }),
    { kind: "disconnected" },
  );
});

test("a number with no integration row falls back to legacy routing", () => {
  assert.deepEqual(routeInbound(null), { kind: "legacy" });
});

// ─── Claiming a number: duplicates across businesses and tenants ─────────────

const claim = (over: Partial<Parameters<typeof decideClaim>[0]>) =>
  decideClaim({ tenantId: "tenant-a", businessId: "biz-1", existing: null, legacyOwner: null, ...over });

test("an unclaimed number is created", () => {
  assert.deepEqual(claim({}), { action: "create" });
});

test("reconnecting a number the business already has updates that row in place", () => {
  assert.deepEqual(
    claim({ existing: { id: "i1", tenantId: "tenant-a", businessId: "biz-1", isActive: true } }),
    { action: "update", integrationId: "i1" },
  );
});

test("a number active on another business of the same tenant is a named conflict", () => {
  assert.deepEqual(
    claim({ existing: { id: "i1", tenantId: "tenant-a", businessId: "biz-2", isActive: true } }),
    { action: "conflict", sameTenant: true },
  );
});

test("a number active in another tenant is an anonymous conflict", () => {
  assert.deepEqual(
    claim({ existing: { id: "i1", tenantId: "tenant-b", businessId: "biz-9", isActive: true } }),
    { action: "conflict", sameTenant: false },
  );
});

test("a number still held in another business's legacy columns is a conflict", () => {
  assert.deepEqual(claim({ legacyOwner: { businessId: "biz-2", tenantId: "tenant-a" } }), {
    action: "conflict",
    sameTenant: true,
  });
});

test("this business's own legacy columns are not a conflict", () => {
  assert.deepEqual(claim({ legacyOwner: { businessId: "biz-1", tenantId: "tenant-a" } }), {
    action: "create",
  });
});

test("a number another business disconnected can be taken over", () => {
  assert.deepEqual(
    claim({ existing: { id: "i1", tenantId: "tenant-b", businessId: "biz-9", isActive: false } }),
    { action: "reassign", integrationId: "i1" },
  );
});

test("after a takeover the old owner's threads are refused, not re-routed", () => {
  // The row now belongs to biz-1; a thread of the previous owner (biz-9) still points at it.
  const takenOver = row({ id: "i1", tenantId: "tenant-a", businessId: "biz-1" });
  assert.deepEqual(checkIntegrationOwnership(takenOver, { businessId: "biz-9", tenantId: "tenant-b" }), {
    ok: false,
    reason: "not-found",
  });
});
