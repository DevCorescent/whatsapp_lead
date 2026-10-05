import test from "node:test";
import assert from "node:assert/strict";

import { decodeViewAs, encodeViewAs, VIEW_AS_TTL_MS } from "../lib/viewAs";

// The secret is read when a cookie is signed, not at import.
process.env.AUTH_SECRET ??= "test-secret-for-view-as";

// ─────────────────────────────────────────────────────────────────────────────
// Super Admin "view as": the cookie only works for the admin it was issued to,
// can't be edited, and runs out.
// ─────────────────────────────────────────────────────────────────────────────

const target = {
  tenantId: "t_client",
  tenantSlug: "client",
  tenantName: "Client A",
  accountType: "CLIENT",
  resellerType: null,
  parentTenantId: null,
};

test("a cookie issued to the admin decodes to the account", () => {
  const cookie = encodeViewAs(target, "admin_1");
  assert.deepEqual(decodeViewAs(cookie, "admin_1"), target);
});

test("another user can't use the cookie", () => {
  assert.equal(decodeViewAs(encodeViewAs(target, "admin_1"), "someone_else"), null);
});

test("an edited cookie is refused", () => {
  const [data, mac] = encodeViewAs(target, "admin_1").split(".");
  const payload = JSON.parse(Buffer.from(data, "base64url").toString());
  payload.tenantId = "t_other";
  const forged = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${mac}`;
  assert.equal(decodeViewAs(forged, "admin_1"), null);
  assert.equal(decodeViewAs("garbage", "admin_1"), null);
  assert.equal(decodeViewAs(undefined, "admin_1"), null);
});

test("the cookie expires", () => {
  const now = Date.now();
  const cookie = encodeViewAs(target, "admin_1", now);
  assert.ok(decodeViewAs(cookie, "admin_1", now + VIEW_AS_TTL_MS - 1000));
  assert.equal(decodeViewAs(cookie, "admin_1", now + VIEW_AS_TTL_MS + 1000), null);
});
