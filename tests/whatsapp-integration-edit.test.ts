import test from "node:test";
import assert from "node:assert/strict";
import { updateWhatsAppIntegrationSchema } from "../lib/validators/whatsappIntegration";

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/integrations/whatsapp/[id] is the one place a connected number can
// be edited by hand. What it REFUSES is the point: Meta's identifiers, the
// stored credentials and the ownership columns must be unreachable from a
// request body, or an edit form becomes a way to repoint a workspace's WhatsApp
// at another account — or to read one back out.
// ─────────────────────────────────────────────────────────────────────────────

const parse = (body: unknown) => updateWhatsAppIntegrationSchema.safeParse(body);

test("the operator's own label can be changed", () => {
  const r = parse({ displayName: "  Support line  " });
  assert.equal(r.success, true);
  assert.equal(r.data?.displayName, "Support line"); // trimmed
});

test("a number can be promoted to default", () => {
  assert.equal(parse({ isDefault: true }).success, true);
});

test("a default is moved by promoting another number, never by clearing one", () => {
  // false would leave a business with no default and no way to name a new one.
  assert.equal(parse({ isDefault: false }).success, false);
});

test("an empty or oversized label is refused", () => {
  assert.equal(parse({ displayName: "" }).success, false);
  assert.equal(parse({ displayName: "   " }).success, false);
  assert.equal(parse({ displayName: "x".repeat(81) }).success, false);
});

test("an empty request is refused rather than treated as a no-op write", () => {
  assert.equal(parse({}).success, false);
});

test("Meta's identifiers cannot be rewritten through this route", () => {
  // Accepting these would point the row at an account the workspace never
  // authorised, while the stored token still belongs to the old one.
  for (const body of [
    { phoneNumberId: "123456789012345" },
    { whatsappBusinessId: "987654321098765" },
    { displayName: "Support", phoneNumberId: "123456789012345" },
  ]) {
    assert.equal(parse(body).success, false, JSON.stringify(body));
  }
});

test("credentials cannot be set through this route", () => {
  for (const body of [
    { accessToken: "EAAG-someone-elses-token" },
    { appSecret: "deadbeef" },
    { verifyToken: "hunter2" },
    { displayName: "Support", accessToken: "EAAG-token" },
  ]) {
    assert.equal(parse(body).success, false, JSON.stringify(body));
  }
});

test("ownership cannot be reassigned through this route", () => {
  for (const body of [
    { tenantId: "another-tenant" },
    { businessId: "another-business" },
    { id: "another-integration" },
    { displayName: "Support", tenantId: "another-tenant" },
  ]) {
    assert.equal(parse(body).success, false, JSON.stringify(body));
  }
});

test("isActive is not a field this route can flip", () => {
  // Disconnecting wipes the token, so "reactivating" a row here would advertise
  // a number that cannot send. That path is connect/disconnect.
  assert.equal(parse({ isActive: true }).success, false);
  assert.equal(parse({ isActive: false }).success, false);
});

test("system timestamps are refused", () => {
  assert.equal(parse({ createdAt: new Date().toISOString() }).success, false);
  assert.equal(parse({ updatedAt: new Date().toISOString() }).success, false);
});
