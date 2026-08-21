import test from "node:test";
import assert from "node:assert/strict";
import { RESOURCE_HINT, RESOURCE_LABEL, RESOURCE_TITLE } from "../lib/billing/limits";

test("the per-agent allowance has its own dialog copy", () => {
  // It reuses the LimitError shape, so the dialog renders it with no new client
  // code — but it must not reuse the tenant copy, which says "upgrade".
  assert.ok(RESOURCE_TITLE.aiUser);
  assert.ok(RESOURCE_LABEL.aiUser);
  assert.notEqual(RESOURCE_TITLE.aiUser, RESOURCE_TITLE.ai);
});

test("the agent hint sends them to a person, not a pricing page", () => {
  // An agent cannot upgrade their way out of a cap their own admin set, so
  // "Upgrade for a larger allowance" would be advice they cannot act on.
  assert.doesNotMatch(RESOURCE_HINT.aiUser, /upgrade/i);
  assert.match(RESOURCE_HINT.aiUser, /Team/);
});

test("every limit resource has a title, label and hint", () => {
  // The dialog indexes these maps by resource; a missing key renders an empty
  // heading rather than throwing, so it would ship unnoticed.
  for (const key of Object.keys(RESOURCE_LABEL)) {
    assert.ok(RESOURCE_TITLE[key as keyof typeof RESOURCE_TITLE], `${key} title`);
    assert.ok(RESOURCE_HINT[key as keyof typeof RESOURCE_HINT], `${key} hint`);
  }
});
