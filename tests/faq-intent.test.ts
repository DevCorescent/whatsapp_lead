import test from "node:test";
import assert from "node:assert/strict";
import {
  FAQ_INTENT_POINTS,
  readFaqIntent,
  readFaqList,
  toJsonFaqs,
} from "../lib/knowledgeFaq";
import { scoreLabelFor } from "../lib/utils";

test("an unclassified question carries no signal", () => {
  // The right default for a question nobody has looked at, rather than assuming
  // every FAQ is commercial.
  assert.equal(readFaqIntent(undefined), "none");
  assert.equal(readFaqIntent("wishful"), "none");
  assert.equal(FAQ_INTENT_POINTS.none, 0);
});

test("a buying signal outweighs plain interest", () => {
  assert.ok(FAQ_INTENT_POINTS.buying > FAQ_INTENT_POINTS.interest);
  assert.ok(FAQ_INTENT_POINTS.interest > FAQ_INTENT_POINTS.none);
});

test("one tap cannot carry a lead across two bands on its own", () => {
  // A tap is evidence, not a verdict. COLD tops out at 30 and WARM at 60, so a
  // weight above 30 could move a cold lead straight to HOT unaided.
  assert.ok(FAQ_INTENT_POINTS.buying <= 30, "buying weight is too large");
  assert.equal(scoreLabelFor(0 + FAQ_INTENT_POINTS.buying), "COLD");
  assert.equal(scoreLabelFor(30 + FAQ_INTENT_POINTS.buying), "WARM");
});

test("intent survives a round trip through storage", () => {
  const stored = toJsonFaqs([{ question: "How do I pay?", answer: "By card.", intent: "buying" }]);
  const read = readFaqList(stored);

  assert.equal(read[0].intent, "buying");
});

test("a none intent is not written to storage", () => {
  // Absent means none, so writing it would be a key on every row that says
  // nothing.
  const stored = toJsonFaqs([{ question: "Where are you?", answer: "Pune.", intent: "none" }]);

  assert.deepEqual(stored, [{ question: "Where are you?", answer: "Pune." }]);
});

test("a stored intent that is no longer valid reads as none", () => {
  const read = readFaqList([{ question: "q", answer: "a", intent: "urgent" }]);
  assert.equal(read[0].intent, undefined);
});
