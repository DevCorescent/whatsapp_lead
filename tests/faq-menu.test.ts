import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFaqListPayload,
  encodeFaqRowId,
  parseFaqRowId,
  WA_LIST_MAX_ROWS,
} from "../lib/knowledgeFaqSend";
import type { DocFaq } from "../lib/knowledgeFaq";

const faq = (n: number, answered = true): DocFaq => ({
  question: `Question number ${n} about something`,
  answer: answered ? `Answer number ${n}` : "",
});

test("a row id survives the round trip", () => {
  const id = encodeFaqRowId("set", "set_abc", 3);
  assert.deepEqual(parseFaqRowId(id), { kind: "set", sourceId: "set_abc", index: 3 });
});

test("a reply that is not ours is ignored", () => {
  // Every inbound interactive reply passes through this — chatbot buttons and
  // anything a tenant builds later — so a loose parse would file unrelated taps
  // as FAQ interest.
  for (const id of [null, undefined, "", "yes", "faq:set:abc", "flow:set:abc:1", "faq:other:abc:1"]) {
    assert.equal(parseFaqRowId(id), null, `should reject ${String(id)}`);
  }
});

test("a non-numeric index is rejected", () => {
  assert.equal(parseFaqRowId("faq:set:abc:one"), null);
  assert.equal(parseFaqRowId("faq:set:abc:-1"), null);
});

test("unanswered questions never reach the menu", () => {
  // A row that leads to nothing is worse than a shorter menu, and half-generated
  // lists are a normal state now that answers arrive one at a time.
  const payload = buildFaqListPayload({
    kind: "document",
    sourceId: "doc_1",
    title: "Support",
    faqs: [faq(1), faq(2, false), faq(3)],
  });

  assert.equal(payload.sent.length, 2);
  const rows = (payload.interactive.action as { sections: { rows: unknown[] }[] }).sections[0].rows;
  assert.equal(rows.length, 2);
});

test("row ids index the sent list, not the original", () => {
  // A dropped or unanswered question must not shift what a row id points at.
  const payload = buildFaqListPayload({
    kind: "document",
    sourceId: "doc_1",
    title: "Support",
    faqs: [faq(1, false), faq(2), faq(3)],
  });

  const rows = (payload.interactive.action as { sections: { rows: { id: string }[] }[] }).sections[0].rows;
  assert.deepEqual(parseFaqRowId(rows[0].id), { kind: "document", sourceId: "doc_1", index: 0 });
  assert.equal(payload.sent[0].answer, "Answer number 2");
});

test("Meta's ten-row cap is respected and reported", () => {
  const faqs = Array.from({ length: 14 }, (_, i) => faq(i));
  const payload = buildFaqListPayload({ kind: "set", sourceId: "s", title: "All", faqs });

  assert.equal(payload.sent.length, WA_LIST_MAX_ROWS);
  assert.equal(payload.dropped, 4);
});

test("titles are clamped to what WhatsApp accepts", () => {
  const payload = buildFaqListPayload({
    kind: "set",
    sourceId: "s",
    title: "T",
    faqs: [{ question: "x".repeat(120), answer: "y".repeat(400) }],
  });

  const rows = (payload.interactive.action as {
    sections: { rows: { title: string; description: string }[] }[];
  }).sections[0].rows;

  assert.ok(rows[0].title.length <= 24, `title was ${rows[0].title.length}`);
  assert.ok(rows[0].description.length <= 72, `description was ${rows[0].description.length}`);
});

test("an empty list produces no rows rather than an invalid payload", () => {
  const payload = buildFaqListPayload({ kind: "set", sourceId: "s", title: "T", faqs: [] });
  assert.equal(payload.sent.length, 0);
});
