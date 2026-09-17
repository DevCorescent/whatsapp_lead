import test from "node:test";
import assert from "node:assert/strict";
import {
  extractGrantedWabaIds,
  selectPhoneNumber,
  selectWaba,
  type WabaPhoneNumber,
} from "../lib/whatsappEmbeddedSignup";

// ─────────────────────────────────────────────────────────────────────────────
// Embedded Signup reports the WABA id and phone number id over postMessage — that
// is, from the browser, where both are free to be substituted. These are the two
// functions that decide whether to believe them, so the cases below are written
// as the attacks they are meant to stop, not merely as branch coverage.
// ─────────────────────────────────────────────────────────────────────────────

const number = (id: string): WabaPhoneNumber => ({ id, display_phone_number: `+91 ${id}` });

// ─── selectWaba ──────────────────────────────────────────────────────────────

test("a WABA the token was never granted is refused, not substituted", () => {
  const result = selectWaba(["102289599326934"], "999999999999999");
  assert.deepEqual(result, { ok: false, reason: "not-granted" });
});

test("a granted WABA the browser named is the one connected", () => {
  const result = selectWaba(["102289599326934", "101569239400667"], "101569239400667");
  assert.deepEqual(result, { ok: true, wabaId: "101569239400667" });
});

test("with no claim, Meta's most recently onboarded WABA is used", () => {
  // Meta documents target_ids as most-recent-first, so the first entry is the one
  // the customer just finished creating in the dialog.
  const result = selectWaba(["102289599326934", "101569239400667"]);
  assert.deepEqual(result, { ok: true, wabaId: "102289599326934" });
});

test("a token carrying no WhatsApp grants cannot connect anything", () => {
  assert.deepEqual(selectWaba([]), { ok: false, reason: "no-grants" });
  assert.deepEqual(selectWaba([], "102289599326934"), { ok: false, reason: "no-grants" });
});

// ─── selectPhoneNumber ───────────────────────────────────────────────────────

test("a phone number absent from the granted WABA is refused", () => {
  // Clearing the WABA check does not license an arbitrary phone number id: a number
  // can belong to an entirely different WABA.
  const result = selectPhoneNumber([number("15550001111")], "15559998888");
  assert.deepEqual(result, { ok: false, reason: "not-on-waba" });
});

test("a phone number listed on the WABA is returned with Meta's own details", () => {
  const result = selectPhoneNumber([number("15550001111"), number("15552223333")], "15552223333");
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.phone.id, "15552223333");
  // The display number comes from Meta, which is why the customer never types it.
  assert.equal(result.ok && result.phone.display_phone_number, "+91 15552223333");
});

test("a WABA with no numbers yet is reported as such rather than connected empty", () => {
  assert.deepEqual(selectPhoneNumber([]), { ok: false, reason: "none" });
  assert.deepEqual(selectPhoneNumber([], "15550001111"), { ok: false, reason: "none" });
});

// ─── extractGrantedWabaIds ───────────────────────────────────────────────────

test("either WhatsApp scope proves the grant", () => {
  // A Facebook Login configuration that only requested messaging still onboards.
  assert.deepEqual(
    extractGrantedWabaIds([{ scope: "whatsapp_business_messaging", target_ids: ["1"] }]),
    ["1"],
  );
  assert.deepEqual(
    extractGrantedWabaIds([{ scope: "whatsapp_business_management", target_ids: ["2"] }]),
    ["2"],
  );
});

test("ids granted under both scopes are not counted twice, and order survives", () => {
  const ids = extractGrantedWabaIds([
    { scope: "whatsapp_business_management", target_ids: ["newest", "older"] },
    { scope: "whatsapp_business_messaging", target_ids: ["newest", "older"] },
  ]);
  // De-duplicated, and still most-recent-first so selectWaba's default stays correct.
  assert.deepEqual(ids, ["newest", "older"]);
});

test("unrelated scopes contribute no WABA ids", () => {
  assert.deepEqual(
    extractGrantedWabaIds([{ scope: "business_management", target_ids: ["portfolio"] }]),
    [],
  );
  assert.deepEqual(extractGrantedWabaIds(undefined), []);
  assert.deepEqual(extractGrantedWabaIds([{ scope: "whatsapp_business_management" }]), []);
});
