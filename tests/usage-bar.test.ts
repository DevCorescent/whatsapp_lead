import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { UsageBar } from "../components/admin/ui";

// ─────────────────────────────────────────────────────────────────────────────
// The admin Tenants table renders monthly message usage through this component.
// These assert the rendered markup, not the arithmetic behind it: the count, the
// percentage and the bar width all have to agree, because a count of 9 above an
// empty bar is only trustworthy if the bar is empty for a reason.
// ─────────────────────────────────────────────────────────────────────────────

/** The count, percentage and width as they appear in the DOM. */
function render(used: number | null | undefined, limit: number | null | undefined) {
  const html = renderToStaticMarkup(createElement(UsageBar, { used, limit }));
  const count = /<span class="text-slate-700">([^<]*)<\/span>/.exec(html)?.[1] ?? null;
  const percent = /<span class="text-slate-500">([^<]*)<\/span>/.exec(html)?.[1] ?? null;
  const width = /style="width:([^"]*)"/.exec(html)?.[1] ?? null;
  return { count, percent, width, html };
}

test("no usage renders a zero count and an empty bar", () => {
  const r = render(0, 5000);
  assert.equal(r.count, "0");
  assert.equal(r.percent, "0%");
  assert.equal(r.width, "0%");
});

test("a real but tiny share of a large plan shows the count and rounds the bar to 0%", () => {
  // Demo Workspace: 9 messages against an Enterprise cap of 500,000 (0.0018%).
  const r = render(9, 500_000);
  assert.equal(r.count, "9");
  assert.equal(r.percent, "0%");
  assert.equal(r.width, "0%");
});

test("a visible share fills the bar to the same percentage it prints", () => {
  const r = render(250, 5000);
  assert.equal(r.count, "250");
  assert.equal(r.percent, "5%");
  assert.equal(r.width, "5%");
});

test("usage exactly at the limit is full", () => {
  const r = render(5000, 5000);
  assert.equal(r.count, "5,000"); // en-IN grouping, as the table has always shown
  assert.equal(r.percent, "100%");
  assert.equal(r.width, "100%");
});

test("usage beyond the limit reports the real count but stops the bar at 100%", () => {
  const r = render(9000, 5000);
  assert.equal(r.count, "9,000");
  assert.equal(r.percent, "100%");
  assert.equal(r.width, "100%");
});

test("an unlimited plan shows its usage against an empty bar, never a full one", () => {
  // limit <= 0 means unlimited here; a full bar would read as "at the cap".
  const r = render(1234, 0);
  assert.equal(r.count, "1,234");
  assert.equal(r.percent, "0%");
  assert.equal(r.width, "0%");
});

test("a missing or malformed API value cannot render a broken bar", () => {
  for (const used of [null, undefined, Number.NaN, -40]) {
    const r = render(used as number, 5000);
    assert.equal(r.count, "0", `used=${String(used)}`);
    assert.equal(r.width, "0%", `used=${String(used)}`);
  }
});
