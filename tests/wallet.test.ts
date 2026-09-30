import test from "node:test";
import assert from "node:assert/strict";
import { RATE_CATEGORIES, whatsappCategory } from "../lib/wallet";

// The rate category decides what a WhatsApp template message costs.

test("WhatsApp templates are priced by their Meta category", () => {
  assert.equal(whatsappCategory("UTILITY"), "WA_UTILITY");
  assert.equal(whatsappCategory("AUTHENTICATION"), "WA_AUTHENTICATION");
  assert.equal(whatsappCategory("MARKETING"), "WA_MARKETING");
  assert.equal(whatsappCategory(null), "WA_MARKETING");
});

test("only WhatsApp categories can be priced", () => {
  assert.deepEqual(RATE_CATEGORIES, ["WA_MARKETING", "WA_UTILITY", "WA_AUTHENTICATION"]);
});
