import test from "node:test";
import assert from "node:assert/strict";
import { analyzeNumbers, normalizeBroadcastNumber, splitNumberInput } from "../lib/broadcast";
import {
  detectBodyVarSlots,
  extractBodyVarNames,
  renderTemplateBody,
  unsupportedTemplateReason,
} from "../lib/campaigns/templateVars";

// ─────────────────────────────────────────────────────────────────────────────
// Bulk Broadcast turns pasted text into the digits-only E.164 numbers the send
// worker, the contacts table and Meta's `to` field all use. A number normalised
// differently here would dedupe wrongly against saved contacts and miss opt-outs.
// ─────────────────────────────────────────────────────────────────────────────

const phone = (raw: string, cc = "91") => {
  const r = normalizeBroadcastNumber(raw, cc);
  return r.ok ? r.phone : `invalid: ${r.reason}`;
};

test("common Indian formats all normalise to the same E.164 digits", () => {
  for (const raw of ["9876543210", "09876543210", "+91 98765 43210", "+91-98765-43210", "919876543210", "0091 9876543210", "(+91) 98765 43210"]) {
    assert.equal(phone(raw), "919876543210", raw);
  }
});

test("an international number keeps its own country code", () => {
  assert.equal(phone("+1 (415) 555-2671"), "14155552671");
  assert.equal(phone("+44 7911 123456"), "447911123456");
});

test("the default country code is configurable", () => {
  assert.equal(phone("4155552671", "1"), "14155552671");
  assert.equal(phone("4155552671", ""), "4155552671");
});

test("junk is rejected with a reason", () => {
  assert.match(phone("abc"), /^invalid: Contains letters/);
  assert.match(phone("12345"), /^invalid: Too short/);
  assert.match(phone("+1234567890123456"), /^invalid: Too long/);
  assert.match(phone("9.19877E+11"), /^invalid: Scientific notation/);
});

test("pasted text splits on lines, commas, semicolons and tabs — not spaces", () => {
  assert.deepEqual(
    splitNumberInput("+91 98765 43210\r\n9123456789, 9000000001;\t9000000002\n\n  \n"),
    ["+91 98765 43210", "9123456789", "9000000001", "9000000002"],
  );
});

test("analysis counts duplicates by normalised number, not by text", () => {
  const a = analyzeNumbers(["9876543210", "+91 98765 43210", "09876543210", "9123456789", "hello"], "91");
  assert.equal(a.total, 5);
  assert.deepEqual(a.valid, ["919876543210", "919123456789"]);
  assert.equal(a.duplicates, 2);
  assert.equal(a.invalid.length, 1);
  assert.equal(a.invalid[0].raw, "hello");
});

test("normalisation is idempotent, so the server can re-run it on the page's output", () => {
  const once = analyzeNumbers(["9876543210", "+1 415 555 2671"], "91").valid;
  assert.deepEqual(analyzeNumbers(once, "91").valid, once);
});

// ─── Template variables ──────────────────────────────────────────────────────

test("slot counting handles positional and named bodies", () => {
  assert.equal(detectBodyVarSlots("Hi {{1}}, your order {{2}} ships {{2}}"), 2);
  assert.equal(detectBodyVarSlots("Hi {{first_name}}, code {{code}} — {{first_name}}"), 2);
  assert.deepEqual(extractBodyVarNames("Hi {{first_name}}, code {{code}}"), ["first_name", "code"]);
  assert.equal(detectBodyVarSlots("No variables"), 0);
});

test("preview rendering fills positional and named placeholders", () => {
  assert.equal(renderTemplateBody("Hi {{1}}, from {{2}}", ["Asha", "Acme"]), "Hi Asha, from Acme");
  assert.equal(renderTemplateBody("Hi {{name}}!", ["Asha"]), "Hi Asha!");
  assert.equal(renderTemplateBody("Hi {{1}} {{2}}", ["Asha"]), "Hi Asha {{2}}");
});

test("templates the sender can't fill are flagged; ordinary ones are not", () => {
  assert.equal(unsupportedTemplateReason({ body: "Hi {{1}}", headerType: "IMAGE", buttons: [{ type: "QUICK_REPLY", text: "Stop" }] }), null);
  assert.equal(unsupportedTemplateReason({ body: "x", buttons: [{ type: "OTP", text: "Copy" }] }), null);
  assert.equal(unsupportedTemplateReason({ body: "x", buttons: [{ type: "URL", url: "https://a.co", urlType: "STATIC" }] }), null);
  assert.ok(unsupportedTemplateReason({ body: "x", headerType: "TEXT", headerContent: "Hello {{1}}" }));
  // Dynamic URL buttons are filled per send now (the "Button links" inputs).
  assert.equal(unsupportedTemplateReason({ body: "x", buttons: [{ type: "URL", url: "https://a.co/{{1}}" }] }), null);
  assert.ok(unsupportedTemplateReason({ body: "x", buttons: [{ type: "COPY_CODE" }] }));
});
