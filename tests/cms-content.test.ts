import test from "node:test";
import assert from "node:assert/strict";
import { isSafeHref, isSafeImageUrl } from "../lib/cms/fields";
import { CMS_SECTION_KEYS } from "../lib/cms/sections";
import {
  describeIssue,
  sectionPayloadSchema,
  toEditorSection,
  toPublicSection,
  type StoredSection,
} from "../lib/cms/store";

function stored(partial: Partial<StoredSection>): StoredSection {
  return {
    isActive: true,
    content: {},
    itemKinds: [],
    items: [],
    updatedAt: new Date("2026-09-14T10:00:00Z"),
    ...partial,
  };
}

/** The editor state for a section, as the admin form would send it back on save. */
function payloadFrom(key: (typeof CMS_SECTION_KEYS)[number], section = toEditorSection(key, null)) {
  return {
    isActive: section.isActive,
    content: section.content,
    items: Object.fromEntries(
      Object.entries(section.items).map(([kind, list]) => [
        kind,
        list.map((item) => ({ ...(item.id ? { id: item.id } : {}), isActive: item.isActive, data: item.data })),
      ]),
    ),
  };
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

test("every shipped default passes the same validation an admin save must pass", () => {
  // If a default is longer than its field allows, the admin could open a section and
  // be unable to save it without first trimming text they never wrote.
  for (const key of CMS_SECTION_KEYS) {
    const result = sectionPayloadSchema(key).safeParse(payloadFrom(key));
    assert.equal(
      result.success,
      true,
      result.success ? "" : `${key}: ${describeIssue(key, result.error.issues[0])}`,
    );
  }
});

test("with nothing saved the homepage renders the defaults", () => {
  const hero = toPublicSection("hero", null);
  assert.equal(hero.content.chatContactName, "Waboxa");
  assert.equal(hero.isActive, true);
  assert.ok(hero.items.event.length > 0);
});

test("placeholder testimonials ship inactive and never render publicly", () => {
  assert.equal(toPublicSection("testimonials", null).items.testimonial.length, 0);
  assert.ok(toEditorSection("testimonials", null).items.testimonial.length > 0);
});

test("no product or integration is called a Waboxa API", () => {
  const names = [
    ...toPublicSection("products", null).items.product.map((p) => p.title),
    ...toPublicSection("integrations", null).items.integration.map((i) => i.name),
  ];
  assert.ok(!names.some((name) => /waboxa/i.test(name)));
});

// ─── Saved content ────────────────────────────────────────────────────────────

test("saved content wins, and a field the row lacks falls back to its default", () => {
  const hero = toPublicSection("hero", stored({ content: { title: "Saved heading" } }));
  assert.equal(hero.content.title, "Saved heading");
  assert.equal(hero.content.primaryCtaLabel, toPublicSection("hero", null).content.primaryCtaLabel);
});

test("inactive items are dropped and the saved order is respected", () => {
  const faq = toPublicSection(
    "faq",
    stored({
      itemKinds: ["faq"],
      items: [
        { id: "b", kind: "faq", sortOrder: 1, isActive: true, data: { question: "Second", answer: "2" } },
        { id: "hidden", kind: "faq", sortOrder: 0, isActive: false, data: { question: "Hidden", answer: "x" } },
        { id: "a", kind: "faq", sortOrder: 0, isActive: true, data: { question: "First", answer: "1" } },
      ],
    }),
  );

  assert.deepEqual(
    faq.items.faq.map((item) => item.question),
    ["First", "Second"],
  );
});

test("a kind saved with no items stays empty; a kind never saved uses the defaults", () => {
  const emptied = toPublicSection("faq", stored({ itemKinds: ["faq"], items: [] }));
  assert.equal(emptied.items.faq.length, 0);

  const neverSaved = toPublicSection("faq", stored({ itemKinds: [], items: [] }));
  assert.ok(neverSaved.items.faq.length > 0);
});

test("a hidden section is reported as hidden", () => {
  assert.equal(toPublicSection("pricing", stored({ isActive: false })).isActive, false);
});

test("an unsafe link in a stored row never reaches the page", () => {
  const cta = toPublicSection("cta", stored({ content: { primaryCtaHref: "javascript:alert(1)" } }));
  assert.equal(cta.content.primaryCtaHref, toPublicSection("cta", null).content.primaryCtaHref);
});

// ─── Validation ───────────────────────────────────────────────────────────────

test("a save with a scripted link is refused with a readable message", () => {
  const payload = payloadFrom("hero");
  payload.content = { ...payload.content, primaryCtaHref: "javascript:alert(1)" };

  const result = sectionPayloadSchema("hero").safeParse(payload);
  assert.equal(result.success, false);
  assert.match(result.success ? "" : describeIssue("hero", result.error.issues[0]), /Primary button link/);
});

test("an invalid item is located by collection and position", () => {
  const payload = payloadFrom("faq");
  payload.items.faq[2] = { ...payload.items.faq[2], data: { question: "", answer: "x" } };

  const result = sectionPayloadSchema("faq").safeParse(payload);
  assert.equal(result.success, false);
  assert.equal(
    result.success ? "" : describeIssue("faq", result.error.issues[0]),
    "Questions #3 · Question is required",
  );
});

test("collections refuse more items than their limit", () => {
  const payload = payloadFrom("hero");
  const event = payload.items.event[0];
  payload.items.event = [event, event, event, event, event];
  assert.equal(sectionPayloadSchema("hero").safeParse(payload).success, false);
});

test("link and image allow-lists", () => {
  for (const ok of ["/pricing", "/register?plan=GROWTH", "#faq", "/#faq", "https://example.com/x", "mailto:a@b.co", "tel:+91 98765 43210"]) {
    assert.equal(isSafeHref(ok), true, ok);
  }
  for (const bad of ["javascript:alert(1)", "//evil.example", "data:text/html,x", "http://x y", "ftp://x"]) {
    assert.equal(isSafeHref(bad), false, bad);
  }
  assert.equal(isSafeImageUrl("https://cdn.example.com/logo.png"), true);
  assert.equal(isSafeImageUrl("http://cdn.example.com/logo.png"), false);
});
