import test from "node:test";
import assert from "node:assert/strict";
import { isClaimableDomain, isClaimableSubdomain, isPlatformHost, subdomainOf } from "../lib/hosts";
import { defaultPrivacy, defaultTerms, parseLegalText } from "../lib/brandLegal";
import { feeKey, feePeriod } from "../lib/whiteLabelFee";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5: white-label completion. A reseller's free subdomain must route to its
// brand (and never to the platform's own names); its legal pages must never name
// the platform; the monthly fee must key to exactly one charge per month.
// ─────────────────────────────────────────────────────────────────────────────

test("free subdomains of the root domain belong to resellers; reserved ones to the platform", () => {
  const prev = process.env.PLATFORM_ROOT_DOMAIN;
  process.env.PLATFORM_ROOT_DOMAIN = "whatscrm.app";
  try {
    assert.equal(subdomainOf("acme.whatscrm.app"), "acme");
    assert.equal(subdomainOf("ACME.WhatsCRM.app:443"), "acme");
    assert.equal(subdomainOf("www.whatscrm.app"), null);
    assert.equal(subdomainOf("app.whatscrm.app"), null);
    assert.equal(subdomainOf("a.b.whatscrm.app"), null);
    assert.equal(subdomainOf("crm.acme.com"), null);

    assert.equal(isPlatformHost("whatscrm.app"), true);
    assert.equal(isPlatformHost("www.whatscrm.app"), true);
    assert.equal(isPlatformHost("app.whatscrm.app"), true);
    assert.equal(isPlatformHost("acme.whatscrm.app"), false);
    assert.equal(isPlatformHost("crm.acme.com"), false);

    // A custom domain can't be one of the platform's names — that's what the subdomain field is for.
    assert.equal(isClaimableDomain("acme.whatscrm.app"), false);
    assert.equal(isClaimableDomain("crm.acme.com"), true);
  } finally {
    if (prev === undefined) delete process.env.PLATFORM_ROOT_DOMAIN;
    else process.env.PLATFORM_ROOT_DOMAIN = prev;
  }
});

test("subdomain labels: 3–30 lowercase letters/digits/hyphens, not reserved", () => {
  assert.equal(isClaimableSubdomain("acme"), true);
  assert.equal(isClaimableSubdomain("acme-crm"), true);
  assert.equal(isClaimableSubdomain("ab"), false);
  assert.equal(isClaimableSubdomain("-acme"), false);
  assert.equal(isClaimableSubdomain("Acme"), false);
  assert.equal(isClaimableSubdomain("www"), false);
  assert.equal(isClaimableSubdomain("admin"), false);
});

test("reseller legal text: # headings, paragraphs, - bullets", () => {
  const sections = parseLegalText("# Agreement\nFirst line\ncontinues here.\n\nSecond paragraph.\n# Rules\n- No spam\n- Honour opt-outs\n# Rules\nAgain");
  assert.equal(sections.length, 3);
  assert.deepEqual(sections[0], { heading: "Agreement", paragraphs: ["First line continues here.", "Second paragraph."] });
  assert.deepEqual(sections[1].bullets, ["No spam", "Honour opt-outs"]);
  assert.equal(sections[2].heading, "Rules (2)"); // headings become anchors, so they're kept unique
  assert.equal(parseLegalText("Just some text")[0].heading, "Overview");
});

test("default legal pages speak for the brand and never name the platform", () => {
  const brand = { name: "Acme CRM", supportEmail: "help@acme.com", address: null };
  const text = JSON.stringify([...defaultTerms(brand), ...defaultPrivacy(brand)]);
  assert.match(text, /Acme CRM/);
  assert.match(text, /help@acme\.com/);
  assert.doesNotMatch(text, /WhatsCRM|Corescent/i);
});

test("the white-label fee is keyed to one charge per reseller per month", () => {
  assert.equal(feePeriod(new Date("2026-10-31T23:59:59Z")), "2026-10");
  assert.equal(feePeriod(new Date("2026-11-01T00:00:00Z")), "2026-11");
  assert.equal(feeKey("t1", "2026-10"), "wlfee:t1:2026-10");
  assert.notEqual(feeKey("t1", "2026-10"), feeKey("t1", "2026-11"));
});
