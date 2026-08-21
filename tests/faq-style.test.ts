import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FAQ_STYLE,
  faqStyleInstructions,
  isDefaultFaqStyle,
  readFaqStyle,
} from "../lib/knowledgeFaq";

test("an unset style reads back as the default", () => {
  assert.deepEqual(readFaqStyle(undefined), DEFAULT_FAQ_STYLE);
  assert.deepEqual(readFaqStyle({}), DEFAULT_FAQ_STYLE);
});

test("a half-written style keeps what it has and defaults the rest", () => {
  // Three writers touch this column; a partial record must not blank the row.
  const style = readFaqStyle({ length: "brief", language: "Hindi" });

  assert.equal(style.length, "brief");
  assert.equal(style.language, "Hindi");
  assert.equal(style.tone, DEFAULT_FAQ_STYLE.tone);
});

test("a nonsense value falls back rather than reaching the prompt", () => {
  const style = readFaqStyle({ length: "epic", tone: 42 });

  assert.equal(style.length, "standard");
  assert.equal(style.tone, "plain");
});

test("the default style is recognised as default", () => {
  assert.equal(isDefaultFaqStyle(DEFAULT_FAQ_STYLE), true);
  assert.equal(isDefaultFaqStyle({ ...DEFAULT_FAQ_STYLE, language: "Hindi" }), false);
});

test("a plain tone adds no instruction", () => {
  // Every added line competes with "answer only from the text", so telling the
  // model to do what it already does is not free.
  const lines = faqStyleInstructions(DEFAULT_FAQ_STYLE);

  assert.equal(lines.length, 1);
  assert.match(lines[0], /one or two sentences/i);
});

test("length, tone, language and audience each contribute a line", () => {
  const lines = faqStyleInstructions({
    length: "detailed",
    tone: "formal",
    audience: "first-time buyers",
    language: "Hindi",
  });

  assert.equal(lines.length, 4);
  assert.match(lines.join(" "), /three or four sentences/i);
  assert.match(lines.join(" "), /formally/i);
  assert.match(lines.join(" "), /first-time buyers/i);
  assert.match(lines.join(" "), /Hindi/);
});

test("a translated answer is told to leave names and prices alone", () => {
  const lines = faqStyleInstructions({ ...DEFAULT_FAQ_STYLE, language: "Marathi" });

  assert.match(lines.join(" "), /Do not translate names, prices or codes/i);
});
