import test from "node:test";
import assert from "node:assert/strict";
import { accountCeiling, PERMISSIONS, resolvePermission } from "../lib/permissions";
import { canAssignRole, canManageMember, generateTempPassword } from "../lib/roles";
import { commissionFor } from "../lib/billing/payments";
import { isClaimableDomain, isPlatformHost, normalizeHost } from "../lib/hosts";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2: account hierarchy. The rules that must never regress: a reseller can
// never read client chats or send as a client; nobody below the platform can mint
// a super admin; commission is computed once, in whole paise.
// ─────────────────────────────────────────────────────────────────────────────

const reseller = (role: string, resellerType = "NORMAL") => ({ role, accountType: "RESELLER", resellerType });
const client = (role: string) => ({ role, accountType: "CLIENT" });

const CLIENT_DATA = [
  "contacts.view", "contacts.manage", "contacts.import", "contacts.export",
  "conversations.view", "messages.send", "campaigns.view", "campaigns.send",
  "templates.manage", "blacklist.view", "blacklist.manage", "reports.view",
] as const;

test("no reseller role can touch client data — not even the owner", () => {
  for (const role of ["TENANT_OWNER", "ADMIN", "MANAGER", "MARKETING_USER", "AGENT"]) {
    for (const p of CLIENT_DATA) {
      assert.equal(resolvePermission(reseller(role, "WHITE_LABEL"), p), false, `${role} ${p}`);
    }
  }
});

test("a database override can't lift a reseller past its ceiling", () => {
  const overrides = new Map([
    ["RESELLER:TENANT_OWNER:conversations.view", true],
    ["RESELLER:TENANT_OWNER:messages.send", true],
  ]);
  assert.equal(resolvePermission(reseller("TENANT_OWNER"), "conversations.view", overrides), false);
  assert.equal(resolvePermission(reseller("TENANT_OWNER"), "messages.send", overrides), false);
});

test("overrides work inside the ceiling", () => {
  const revoke = new Map([["CLIENT:MANAGER:campaigns.send", false]]);
  assert.equal(resolvePermission(client("MANAGER"), "campaigns.send"), true);
  assert.equal(resolvePermission(client("MANAGER"), "campaigns.send", revoke), false);
  const grant = new Map([["CLIENT:AGENT:contacts.export", true]]);
  assert.equal(resolvePermission(client("AGENT"), "contacts.export", grant), true);
});

test("resellers manage clients and plans; only white-label resellers manage branding", () => {
  assert.equal(resolvePermission(reseller("TENANT_OWNER"), "reseller.clients.manage"), true);
  assert.equal(resolvePermission(reseller("TENANT_OWNER"), "reseller.plans.manage"), true);
  assert.equal(resolvePermission(reseller("TENANT_OWNER"), "whitelabel.manage"), false);
  assert.equal(resolvePermission(reseller("TENANT_OWNER", "WHITE_LABEL"), "whitelabel.manage"), true);
  assert.equal(resolvePermission(reseller("MANAGER"), "reseller.clients.manage"), false);
  assert.equal(resolvePermission(reseller("MANAGER"), "reseller.clients.view"), true);
});

test("client accounts never get reseller permissions", () => {
  for (const p of ["reseller.clients.view", "reseller.clients.manage", "reseller.plans.manage", "whitelabel.manage"] as const) {
    assert.equal(resolvePermission(client("TENANT_OWNER"), p), false, p);
  }
});

test("the super admin holds everything; the platform ceiling is everything", () => {
  for (const p of PERMISSIONS) assert.equal(resolvePermission({ role: "SUPER_ADMIN" }, p), true, p);
  assert.equal(accountCeiling("PLATFORM").length, PERMISSIONS.length);
});

// ─── Staff roles ─────────────────────────────────────────────────────────────

test("nobody can hand out SUPER_ADMIN from an account's team screen", () => {
  for (const caller of ["TENANT_OWNER", "ADMIN", "MANAGER"]) {
    assert.equal(canAssignRole(caller, "SUPER_ADMIN"), false, caller);
  }
});

test("roles can only be given below your own rank (owners may transfer ownership)", () => {
  assert.equal(canAssignRole("MANAGER", "AGENT"), true);
  assert.equal(canAssignRole("MANAGER", "MANAGER"), false);
  assert.equal(canAssignRole("MANAGER", "ADMIN"), false);
  assert.equal(canAssignRole("ADMIN", "ADMIN"), false);
  assert.equal(canAssignRole("ADMIN", "TENANT_OWNER"), false);
  assert.equal(canAssignRole("TENANT_OWNER", "TENANT_OWNER"), true);
  assert.equal(canAssignRole("TENANT_OWNER", "NOT_A_ROLE"), false);
});

test("an admin can't change the owner or another admin", () => {
  assert.equal(canManageMember("ADMIN", "TENANT_OWNER"), false);
  assert.equal(canManageMember("ADMIN", "ADMIN"), false);
  assert.equal(canManageMember("ADMIN", "MANAGER"), true);
  assert.equal(canManageMember("TENANT_OWNER", "ADMIN"), true);
  assert.equal(canManageMember("TENANT_OWNER", "SUPER_ADMIN"), false);
});

test("temporary passwords are long and never repeat", () => {
  const a = generateTempPassword();
  const b = generateTempPassword();
  assert.notEqual(a, b);
  assert.ok(a.length >= 16);
});

// ─── Commission ──────────────────────────────────────────────────────────────

test("commission is a whole-paise percentage of the payment", () => {
  assert.equal(commissionFor(99_900, 10), 9_990);      // ₹999 at 10% = ₹99.90
  assert.equal(commissionFor(99_900, 12.5), 12_488);   // rounded to the nearest paisa
  assert.equal(commissionFor(99_900, 0), 0);
  assert.equal(commissionFor(0, 10), 0);
  assert.equal(commissionFor(10_000, 150), 10_000);    // never more than the payment
});

// ─── Hosts ───────────────────────────────────────────────────────────────────

test("hosts normalise and the platform's own hosts aren't claimable", () => {
  assert.equal(normalizeHost("https://CRM.Acme.com:443/login"), "crm.acme.com");
  assert.equal(isPlatformHost("localhost:3000"), true);
  assert.equal(isPlatformHost("whatsapp-lead-five.vercel.app"), true);
  assert.equal(isPlatformHost("crm.acme.com"), false);
  assert.equal(isClaimableDomain("crm.acme.com"), true);
  assert.equal(isClaimableDomain("localhost"), false);
  assert.equal(isClaimableDomain("my-app.vercel.app"), false);
  assert.equal(isClaimableDomain("192.168.1.10"), false);
  assert.equal(isClaimableDomain("not a domain"), false);
});
