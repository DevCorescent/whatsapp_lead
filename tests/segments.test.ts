import test from "node:test";
import assert from "node:assert/strict";
import { segmentFiltersSchema, segmentRuleSchema } from "../lib/segmentRules";

test("a city + tag + status segment validates", () => {
  const r = segmentFiltersSchema.safeParse({
    rules: [
      { field: "location", op: "is", values: ["Delhi", "Noida"] },
      { field: "tags", op: "all", values: ["tag_1"] },
      { field: "status", op: "is", values: ["active"] },
    ],
  });
  assert.equal(r.success, true);
});

test("an empty rule list is allowed (everyone)", () => {
  assert.equal(segmentFiltersSchema.safeParse({ rules: [] }).success, true);
});

test("a rule needs at least one value", () => {
  assert.equal(segmentRuleSchema.safeParse({ field: "location", op: "is", values: [] }).success, false);
});

test("operators are checked per field", () => {
  assert.equal(segmentRuleSchema.safeParse({ field: "tags", op: "contains", values: ["x"] }).success, false);
  assert.equal(segmentRuleSchema.safeParse({ field: "location", op: "none", values: ["x"] }).success, false);
});

test("status values are restricted", () => {
  assert.equal(segmentRuleSchema.safeParse({ field: "status", op: "is", values: ["vip"] }).success, false);
});

test("custom field names cannot carry JSON-path tricks", () => {
  assert.equal(segmentRuleSchema.safeParse({ field: "custom", key: "city", op: "is", values: ["a"] }).success, true);
  assert.equal(segmentRuleSchema.safeParse({ field: "custom", key: "a'}->>'b", op: "is", values: ["a"] }).success, false);
});

test("unknown fields are rejected and 20 rules is the cap", () => {
  assert.equal(segmentRuleSchema.safeParse({ field: "phone", op: "is", values: ["1"] }).success, false);
  const many = Array.from({ length: 21 }, () => ({ field: "name", op: "contains", values: ["a"] }));
  assert.equal(segmentFiltersSchema.safeParse({ rules: many }).success, false);
});
