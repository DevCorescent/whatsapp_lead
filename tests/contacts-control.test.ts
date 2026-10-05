import test from "node:test";
import assert from "node:assert/strict";
import { resolvePermission } from "../lib/permissions";
import { ACTION_PERMISSION, CONTACT_ACTIONS } from "../lib/contactActions";
import { reportPeriod } from "../lib/clientReport";

// ─────────────────────────────────────────────────────────────────────────────
// Contact control and reseller reports: deleting contacts is an owner/admin
// power, blocking needs blacklist rights, resellers get neither, and the
// client report only accepts its fixed periods.
// ─────────────────────────────────────────────────────────────────────────────

const client = (role: string) => ({ role, accountType: "CLIENT" });
const reseller = (role: string) => ({ role, accountType: "RESELLER", resellerType: "WHITE_LABEL" });

test("owners and admins can delete contacts; other roles can't by default", () => {
  for (const role of ["TENANT_OWNER", "ADMIN"]) assert.equal(resolvePermission(client(role), "contacts.delete"), true, role);
  for (const role of ["MANAGER", "MARKETING_USER", "AGENT"]) assert.equal(resolvePermission(client(role), "contacts.delete"), false, role);
  assert.equal(resolvePermission({ role: "SUPER_ADMIN" }, "contacts.delete"), true);
});

test("the super admin can switch contact deletion on for a role", () => {
  const overrides = new Map([["CLIENT:MANAGER:contacts.delete", true]]);
  assert.equal(resolvePermission(client("MANAGER"), "contacts.delete", overrides), true);
});

test("no reseller role can view, delete or block a client's contacts", () => {
  for (const role of ["TENANT_OWNER", "ADMIN", "MANAGER"]) {
    for (const p of ["contacts.view", "contacts.delete", "blacklist.manage"] as const) {
      assert.equal(resolvePermission(reseller(role), p), false, `${role} ${p}`);
    }
  }
});

test("every contact action is gated by a permission", () => {
  for (const action of CONTACT_ACTIONS) assert.ok(ACTION_PERMISSION[action], action);
  assert.equal(ACTION_PERMISSION.delete, "contacts.delete");
  assert.equal(ACTION_PERMISSION.block, "blacklist.manage");
});

test("report period falls back to 30 days for anything unexpected", () => {
  assert.equal(reportPeriod("7"), 7);
  assert.equal(reportPeriod("90"), 90);
  assert.equal(reportPeriod("365"), 30);
  assert.equal(reportPeriod(null), 30);
});

// ─── Template buttons (Broadcast / Campaigns) ────────────────────────────────

import { dynamicUrlButtons, hasOtpButton, renderButtonUrl, unsupportedTemplateReason } from "../lib/campaigns/templateVars";

test("an imported OTP copy-code button is not mistaken for a dynamic link", () => {
  const otp = {
    body: "*{{1}}* is your verification code.",
    buttons: [{ type: "URL", text: "Copy code", url: "https://www.whatsapp.com/otp/code/?otp_type=COPY_CODE&code=otp{{1}}" }],
  };
  assert.equal(unsupportedTemplateReason(otp), null);
  assert.equal(hasOtpButton(otp), true);
  assert.deepEqual(dynamicUrlButtons(otp), []);
});

test("dynamic URL buttons can be broadcast and are indexed among all buttons", () => {
  const t = {
    body: "Hi {{1}}",
    buttons: [
      { type: "QUICK_REPLY", text: "Stop" },
      { type: "URL", text: "Track", url: "https://shop.example/track/{{1}}" },
      { type: "URL", text: "Site", url: "https://shop.example" },
    ],
  };
  assert.equal(unsupportedTemplateReason(t), null);
  assert.deepEqual(dynamicUrlButtons(t).map((b) => b.index), [1]);
  assert.equal(renderButtonUrl("https://shop.example/track/{{1}}", "AB12"), "https://shop.example/track/AB12");
});

test("coupon-code buttons and header variables are still refused", () => {
  assert.ok(unsupportedTemplateReason({ body: "x", buttons: [{ type: "COPY_CODE", text: "Copy" }] }));
  assert.ok(unsupportedTemplateReason({ body: "x", headerType: "TEXT", headerContent: "Hi {{1}}" }));
});
