import test from "node:test";
import assert from "node:assert/strict";
import { isValidPhone, normalizePhone } from "../lib/import";
import { createContactSchema, updateContactSchema } from "../lib/validators/contact";
import { FIELD_PREFIX, renderTemplateBody, resolveBodyParams } from "../lib/campaigns/templateVars";
import { resolvePermission as can } from "../lib/permissions";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1: one phone normaliser for every entry point (duplicate prevention and
// blacklist matching depend on it), per-recipient variables for personalised
// broadcasts, and the role → permission matrix the APIs now enforce.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Duplicate prevention: every path produces the same key ──────────────────

test("manual, imported and inbound forms of a number normalise identically", () => {
  const forms = ["+91 98765 43210", "9876543210", "09876543210", "919876543210", "0091-98765-43210", "(+91) 98765-43210"];
  for (const f of forms) assert.equal(normalizePhone(f), "919876543210", f);
});

test("a short number is not padded into a valid-looking one", () => {
  // "12345678" must not become "9112345678" — that would pass validation and message a stranger.
  assert.equal(isValidPhone(normalizePhone("12345678")), false);
  assert.equal(isValidPhone(normalizePhone("98765")), false);
});

test("international numbers keep their own country code", () => {
  assert.equal(normalizePhone("+1 415 555 2671"), "14155552671");
  assert.equal(normalizePhone("+971 50 123 4567"), "971501234567");
  assert.equal(normalizePhone("4155552671", "1"), "14155552671");
});

test("the contact schema stores the normalised number, so the unique key catches duplicates", () => {
  const a = createContactSchema.parse({ name: "Rahul", phone: "+91 98765 43210" });
  const b = createContactSchema.parse({ name: "Rahul", phone: "9876543210" });
  assert.equal(a.phone, "919876543210");
  assert.equal(a.phone, b.phone);
  assert.equal(createContactSchema.safeParse({ name: "X", phone: "12345" }).success, false);
  assert.equal(updateContactSchema.parse({ phone: "09876543210" }).phone, "919876543210");
  assert.equal(updateContactSchema.parse({ name: "Only a rename" }).phone, undefined);
});

// ─── Personalised variables ──────────────────────────────────────────────────

test("each student gets their own marks from the imported sheet", () => {
  const body = "Hello {{name}}, your result is:\nSubject 1: {{sub1}}\nSubject 2: {{sub2}}\nSubject 3: {{sub3}}";
  const mapping = ["name", `${FIELD_PREFIX}Subject1`, `${FIELD_PREFIX}Subject2`, `${FIELD_PREFIX}Subject3`];

  const rahul = resolveBodyParams(mapping, {
    phone: "919876543210",
    name: "Rahul",
    fields: { Subject1: "85", Subject2: "78", Subject3: "91" },
  });
  const priya = resolveBodyParams(mapping, {
    phone: "919123456789",
    name: "Priya",
    fields: { Subject1: "92", Subject2: "88", Subject3: "95" },
  });

  assert.deepEqual(rahul, ["Rahul", "85", "78", "91"]);
  assert.deepEqual(priya, ["Priya", "92", "88", "95"]);
  assert.equal(
    renderTemplateBody(body, rahul),
    "Hello Rahul, your result is:\nSubject 1: 85\nSubject 2: 78\nSubject 3: 91",
  );
});

test("missing values become '-' and newlines are collapsed, both of which Meta requires", () => {
  const params = resolveBodyParams(["name", `${FIELD_PREFIX}Grade`, "company", "Fixed text"], {
    phone: "919876543210",
    fields: { Grade: "A\nplus" },
  });
  assert.deepEqual(params, ["-", "A plus", "-", "Fixed text"]);
});

test("phone and literal text resolve as before", () => {
  assert.deepEqual(resolveBodyParams(["phone", "Diwali offer"], { phone: "919876543210" }), ["919876543210", "Diwali offer"]);
});

// ─── Permissions (client accounts) ───────────────────────────────────────────

const client = (role: string) => ({ role, accountType: "CLIENT" });

test("agents can't broadcast, import, export or touch the blacklist", () => {
  for (const p of ["campaigns.send", "contacts.import", "contacts.export", "blacklist.view", "blacklist.manage"] as const) {
    assert.equal(can(client("AGENT"), p), false, p);
  }
  assert.equal(can(client("AGENT"), "contacts.manage"), true);
  assert.equal(can(client("AGENT"), "messages.send"), true);
});

test("only owners and admins manage the blacklist; managers and marketing can view it", () => {
  assert.equal(can(client("TENANT_OWNER"), "blacklist.manage"), true);
  assert.equal(can(client("ADMIN"), "blacklist.manage"), true);
  assert.equal(can(client("MANAGER"), "blacklist.manage"), false);
  assert.equal(can(client("MANAGER"), "blacklist.view"), true);
  assert.equal(can(client("MARKETING_USER"), "blacklist.manage"), false);
  assert.equal(can(client("MARKETING_USER"), "campaigns.send"), true);
});

test("unknown or missing roles get nothing", () => {
  assert.equal(can(undefined, "contacts.view"), false);
  assert.equal(can(client("RESELLER"), "contacts.view"), false);
  assert.equal(can(client("ADMIN"), "billing.manage"), true);
  assert.equal(can(client("MANAGER"), "billing.manage"), false);
});
