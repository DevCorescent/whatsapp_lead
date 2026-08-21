import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAnswerResponse,
  parseQuestionsResponse,
  readFaqList,
  toJsonFaqs,
} from "../lib/knowledgeFaq";
import { buildCorpus } from "../lib/knowledgeFaq.server";

// ─── Question proposals ───────────────────────────────────────────────────────

test("questions are read out of a fenced JSON array", () => {
  const raw = 'Sure!\n```json\n["What is the refund window?", "How do I claim?"]\n```';

  assert.deepEqual(parseQuestionsResponse(raw), [
    "What is the refund window?",
    "How do I claim?",
  ]);
});

test("a model that answers with objects instead of strings is still understood", () => {
  const raw = '[{"question":"What is the fee?"},{"q":"When does it renew?"}]';

  assert.deepEqual(parseQuestionsResponse(raw), ["What is the fee?", "When does it renew?"]);
});

test("the same question phrased twice is only kept once", () => {
  // Asked for six questions about a two-page document, models repeat themselves.
  const raw = '["What is the fee?", "what is the fee?", "How do I pay?"]';

  assert.deepEqual(parseQuestionsResponse(raw), ["What is the fee?", "How do I pay?"]);
});

test("more questions than asked for are trimmed", () => {
  const raw = JSON.stringify(["a", "b", "c", "d"]);

  assert.equal(parseQuestionsResponse(raw, 2).length, 2);
});

test("unparseable output yields no questions rather than a broken one", () => {
  assert.deepEqual(parseQuestionsResponse("I could not find anything useful."), []);
});

// ─── Answers ──────────────────────────────────────────────────────────────────

test("an answer object carries its source", () => {
  const raw = '{"answer":"Within 30 days.","source":"policy.pdf"}';

  assert.deepEqual(parseAnswerResponse(raw), { answer: "Within 30 days.", source: "policy.pdf" });
});

test("plain prose is accepted as the answer", () => {
  // The one call where unparseable output is still usable — prose is what was
  // asked for, minus the JSON wrapper.
  assert.deepEqual(parseAnswerResponse("Within 30 days of delivery."), {
    answer: "Within 30 days of delivery.",
  });
});

test("an empty response is not an answer", () => {
  assert.equal(parseAnswerResponse("   "), null);
});

// ─── Stored list ──────────────────────────────────────────────────────────────

test("a question waiting for its answer survives a reload", () => {
  // Generation runs one row at a time now, so a half-filled list is a real state
  // rather than corruption — dropping answerless rows would make half a
  // generated list vanish on refresh.
  const rows = readFaqList([
    { question: "What is the fee?", answer: "" },
    { question: "How do I pay?", answer: "By card." },
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].answer, "");
});

test("rows with no question at all are dropped", () => {
  assert.deepEqual(readFaqList([{ question: "  ", answer: "orphan" }]), []);
});

test("json-safe rows carry no undefined keys", () => {
  const json = toJsonFaqs([{ question: "q", answer: "a", source: undefined, edited: false }]);

  assert.deepEqual(json, [{ question: "q", answer: "a" }]);
});

// ─── Multi-document corpus ────────────────────────────────────────────────────

test("every document contributes, and each is labelled", () => {
  const corpus = buildCorpus(
    [
      { id: "1", name: "policy.pdf", content: "Refunds within 30 days." },
      { id: "2", name: "prices.md", content: "The plan costs 999." },
    ],
    5000,
  );

  assert.deepEqual(corpus.sources, ["policy.pdf", "prices.md"]);
  assert.match(corpus.text, /### policy\.pdf/);
  assert.match(corpus.text, /### prices\.md/);
  assert.equal(corpus.truncated, false);
});

test("a long document cannot crowd its companions out of the budget", () => {
  // Concatenated and cut at the cap, the manual would consume everything and the
  // price list beside it would contribute nothing — the set would claim to cover
  // two documents and answer from one.
  const corpus = buildCorpus(
    [
      { id: "1", name: "manual.pdf", content: "M".repeat(50_000) },
      { id: "2", name: "prices.md", content: "The plan costs 999." },
    ],
    4000,
  );

  assert.equal(corpus.truncated, true);
  assert.match(corpus.text, /The plan costs 999\./);
  assert.ok(corpus.text.length <= 4000, `corpus was ${corpus.text.length} chars`);
});

test("empty documents are skipped rather than counted as sources", () => {
  const corpus = buildCorpus([
    { id: "1", name: "blank.pdf", content: "   " },
    { id: "2", name: "prices.md", content: "The plan costs 999." },
  ]);

  assert.deepEqual(corpus.sources, ["prices.md"]);
});

test("a corpus of nothing is empty, not a header with no body", () => {
  const corpus = buildCorpus([{ id: "1", name: "blank.pdf", content: "" }]);

  assert.equal(corpus.text, "");
  assert.deepEqual(corpus.sources, []);
});
