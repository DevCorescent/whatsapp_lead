import test from "node:test";
import assert from "node:assert/strict";
import { publicVariables, readRunId, RUN_ID_VAR } from "../lib/flowRun";
import { INTENT_POINTS, readIntent } from "../lib/leadSignal";
import { scoreLabelFor } from "../lib/utils";

test("engine bookkeeping is stripped from the exported variables", () => {
  // The navigation stack, attempt counter and run id are ours, not answers a
  // sales team asked for — and they would each become a CSV column.
  const kept = publicVariables({
    topic: "Track my order",
    new_address: "12 Main St",
    __menuStack: '["n1","n2"]',
    __menuAttempts: "1",
    [RUN_ID_VAR]: "run_abc",
  });

  assert.deepEqual(kept, { topic: "Track my order", new_address: "12 Main St" });
});

test("empty answers are dropped rather than exported as blank columns", () => {
  assert.deepEqual(publicVariables({ answered: "yes", skipped: "" }), { answered: "yes" });
});

test("the run id survives a round trip through the flow variables", () => {
  // It rides in the variables so the next inbound message finds the same open
  // run without another column on the conversation.
  assert.equal(readRunId({ [RUN_ID_VAR]: "run_abc" }), "run_abc");
  assert.equal(readRunId({}), null);
  assert.equal(readRunId({ [RUN_ID_VAR]: "" }), null);
});

test("a menu choice and a FAQ tap score identically", () => {
  // They are the same event to a sales team: the customer picked a commercial
  // question off a list. Two scales would become two definitions of "warm".
  assert.equal(INTENT_POINTS.buying, 15);
  assert.equal(INTENT_POINTS.interest, 5);
  assert.equal(INTENT_POINTS.none, 0);
});

test("an unclassified option carries no signal", () => {
  assert.equal(readIntent(undefined), "none");
  assert.equal(readIntent("commercial"), "none");
});

test("one choice cannot carry a lead across two bands", () => {
  // COLD tops out at 30, so a weight above that could move a cold lead straight
  // to HOT on a single tap. A choice is evidence, not a verdict.
  assert.ok(INTENT_POINTS.buying <= 30);
  assert.equal(scoreLabelFor(0 + INTENT_POINTS.buying), "COLD");
  assert.equal(scoreLabelFor(30 + INTENT_POINTS.buying), "WARM");
});
