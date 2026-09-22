import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { TenantSettings } from "@prisma/client";
import { encryptSecret, isEncryptionConfigured } from "../lib/crypto";
import { PUBLIC_INTEGRATION_SELECT } from "../lib/whatsappIntegrations";
import {
  SECRET_SETTINGS_FIELDS,
  publicTenantSettings,
} from "../lib/publicSettings";
import {
  missingEmbeddedSignupEnv,
  readEmbeddedSignupConfig,
} from "../lib/whatsappEmbeddedSignup";
import { publicBusiness } from "../lib/business";

// ─────────────────────────────────────────────────────────────────────────────
// These are regression tests for a real exposure, not hypothetical hardening.
//
// GET /api/settings answered `{ ...settings }` for the manual credential form to
// prefill itself from. That published the WhatsApp access token, the WhatsApp App
// Secret, the webhook verify token and the SMTP password to every authenticated
// member of the tenant — and since `encryptSecret` returns plaintext when
// ENCRYPTION_KEY is unset, on such a deployment those were live credentials.
//
// The sentinels below are deliberately distinctive so that a leak cannot hide
// inside a nested object, a date, or a JSON-encoded blob: each assertion searches
// the serialised response, not just its top-level keys.
// ─────────────────────────────────────────────────────────────────────────────

const SENTINEL = {
  waApiKey: "EAA_SENTINEL_ACCESS_TOKEN_MUST_NOT_LEAK",
  waAppSecret: "SENTINEL_APP_SECRET_MUST_NOT_LEAK",
  waWebhookVerifyToken: "SENTINEL_VERIFY_TOKEN_MUST_NOT_LEAK",
  smtpPass: "SENTINEL_SMTP_PASSWORD_MUST_NOT_LEAK",
} as const;

function settingsRow(): TenantSettings {
  return {
    id: "ts_1",
    tenantId: "tenant_1",
    waPhoneNumberId: "109876543210987",
    waBusinessAccountId: "102289599326934",
    waApiKey: SENTINEL.waApiKey,
    waWebhookVerifyToken: SENTINEL.waWebhookVerifyToken,
    waAppSecret: SENTINEL.waAppSecret,
    aiEnabled: true,
    aiModel: "gpt-4o-mini",
    autoReply: false,
    autoReplyDelay: 3,
    aiPersonality: null,
    timezone: "Asia/Kolkata",
    businessHoursStart: "09:00",
    businessHoursEnd: "18:00",
    businessDays: [1, 2, 3, 4, 5],
    offHoursMessage: null,
    smtpHost: "smtp.example.com",
    smtpPort: 587,
    smtpUser: "mailer@example.com",
    smtpPass: SENTINEL.smtpPass,
    smtpFrom: "WhatsCRM <mailer@example.com>",
    onboardingCompleted: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
  } as TenantSettings;
}

// ─── GET /api/settings projection ────────────────────────────────────────────

test("no secret value appears anywhere in the settings response", () => {
  const serialised = JSON.stringify(
    publicTenantSettings(settingsRow(), {
      name: "Acme",
      slug: "acme",
      logo: null,
      domain: null,
    }),
  );

  for (const value of Object.values(SENTINEL)) {
    assert.equal(
      serialised.includes(value),
      false,
      `secret value leaked into GET /api/settings: ${value}`,
    );
  }
});

test("no secret field name is even present as a key", () => {
  const projected = publicTenantSettings(settingsRow(), null) as Record<string, unknown>;

  for (const field of SECRET_SETTINGS_FIELDS) {
    assert.equal(
      field in projected,
      false,
      `secret field "${field}" should not be a key of the settings response`,
    );
  }
});

test("secrets are reported as presence booleans instead", () => {
  const configured = publicTenantSettings(settingsRow(), null);
  assert.equal(configured.hasWaApiKey, true);
  assert.equal(configured.hasWaAppSecret, true);
  assert.equal(configured.hasWaWebhookVerifyToken, true);
  assert.equal(configured.hasSmtpPass, true);

  const empty = publicTenantSettings(
    { ...settingsRow(), waApiKey: null, waAppSecret: null, waWebhookVerifyToken: null, smtpPass: null },
    null,
  );
  assert.equal(empty.hasWaApiKey, false);
  assert.equal(empty.hasWaAppSecret, false);
  assert.equal(empty.hasWaWebhookVerifyToken, false);
  assert.equal(empty.hasSmtpPass, false);
});

test("non-secret configuration still reaches the browser", () => {
  // The projection must not be so aggressive that the settings screens break —
  // an allowlist that drops everything would pass the leak tests above.
  const projected = publicTenantSettings(settingsRow(), {
    name: "Acme",
    slug: "acme",
    logo: null,
    domain: null,
  });

  assert.equal(projected.tenant?.name, "Acme");
  assert.equal(projected.timezone, "Asia/Kolkata");
  assert.equal(projected.businessHoursStart, "09:00");
  assert.deepEqual(projected.businessDays, [1, 2, 3, 4, 5]);
  // Identifiers are not credentials and the support screens show them.
  assert.equal(projected.waPhoneNumberId, "109876543210987");
  assert.equal(projected.waBusinessAccountId, "102289599326934");
  assert.equal(projected.smtpHost, "smtp.example.com");
});

// ─── Embedded Signup browser configuration ───────────────────────────────────

test("the Embedded Signup config handed to the browser carries no app secret", () => {
  const appSecret = "SENTINEL_ES_APP_SECRET_MUST_NOT_LEAK";
  const previous = {
    id: process.env.WHATSAPP_APP_ID,
    secret: process.env.WHATSAPP_APP_SECRET,
    config: process.env.WHATSAPP_ES_CONFIG_ID,
  };

  process.env.WHATSAPP_APP_ID = "1645265007306578";
  process.env.WHATSAPP_APP_SECRET = appSecret;
  process.env.WHATSAPP_ES_CONFIG_ID = "1234567890123456";

  try {
    const config = readEmbeddedSignupConfig();
    assert.ok(config, "expected a config when the environment is complete");

    // The app id and config id are public by construction — the Facebook JS SDK
    // puts both in the page. The app secret is what lets a holder mint customer
    // tokens, so its absence is the property worth pinning.
    assert.deepEqual(Object.keys(config).sort(), ["appId", "configId", "graphVersion"]);
    assert.equal(JSON.stringify(config).includes(appSecret), false);
  } finally {
    process.env.WHATSAPP_APP_ID = previous.id;
    process.env.WHATSAPP_APP_SECRET = previous.secret;
    process.env.WHATSAPP_ES_CONFIG_ID = previous.config;
  }
});

test("Embedded Signup stays disabled when the app secret is missing", () => {
  // The browser never needs the secret, but a deployment without it cannot complete
  // the code exchange — so the flow is refused up front rather than failing inside
  // Meta's dialog, where the customer would read it as their own mistake.
  const previous = process.env.WHATSAPP_APP_SECRET;
  process.env.WHATSAPP_APP_ID = "1645265007306578";
  process.env.WHATSAPP_ES_CONFIG_ID = "1234567890123456";
  delete process.env.WHATSAPP_APP_SECRET;

  try {
    // readEmbeddedSignupConfig only needs the two public values...
    assert.ok(readEmbeddedSignupConfig());
    // ...but the route gates on this, which reports the secret as missing.
    assert.deepEqual(missingEmbeddedSignupEnv(), ["WHATSAPP_APP_SECRET"]);
  } finally {
    if (previous === undefined) delete process.env.WHATSAPP_APP_SECRET;
    else process.env.WHATSAPP_APP_SECRET = previous;
  }
});

// ─── Business projection ─────────────────────────────────────────────────────

test("publicBusiness strips the token, verify token and app secret", () => {
  const business = {
    id: "biz_1",
    tenantId: "tenant_1",
    name: "Acme",
    slug: "acme",
    whatsappPhoneNumber: "+91 98765 43210",
    whatsappPhoneNumberId: "109876543210987",
    whatsappBusinessId: "102289599326934",
    whatsappAccessToken: "EAA_SENTINEL_BUSINESS_TOKEN_MUST_NOT_LEAK",
    whatsappVerifyToken: "SENTINEL_BUSINESS_VERIFY_MUST_NOT_LEAK",
    whatsappAppSecret: "SENTINEL_BUSINESS_APP_SECRET_MUST_NOT_LEAK",
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projected = publicBusiness(business as any);
  const serialised = JSON.stringify(projected);

  for (const secret of [
    business.whatsappAccessToken,
    business.whatsappVerifyToken,
    business.whatsappAppSecret,
  ]) {
    assert.equal(serialised.includes(secret), false, `leaked: ${secret}`);
  }

  assert.equal(projected.hasWhatsappToken, true);
  assert.equal(projected.hasWhatsappVerifyToken, true);
  assert.equal(projected.hasWhatsappAppSecret, true);
  // Legacy credentials still count as connected, so existing businesses keep their badge.
  assert.equal(projected.whatsappConnected, true);
  assert.equal(projected.whatsappNumberCount, 0);
});

// ─── Integration projection ──────────────────────────────────────────────────

test("the integration select used by browser-facing routes names no secret column", () => {
  // /api/integrations/whatsapp and the connect response are both built from this
  // select. A secret added to the model later is only exposed if someone adds it
  // here, so this asserts the three that exist today stay out.
  const selected = Object.keys(PUBLIC_INTEGRATION_SELECT);

  for (const secret of ["accessToken", "verifyToken", "appSecret"]) {
    assert.equal(
      selected.includes(secret),
      false,
      `PUBLIC_INTEGRATION_SELECT must not select "${secret}"`,
    );
  }

  // ...and still carries what the connected-account panel renders.
  for (const needed of ["phoneNumber", "phoneNumberId", "whatsappBusinessId", "isActive"]) {
    assert.equal(selected.includes(needed), true, `expected "${needed}" to be selected`);
  }
});

// ─── Tokens must never travel in a URL ───────────────────────────────────────

test("no access token is placed in a Graph API URL", () => {
  // The legacy /api/settings/whatsapp-test route built
  //   ...?fields=...&access_token=<token>
  // which writes a live credential into every access log and proxy between the
  // server and Meta. Scanning the source keeps that from coming back anywhere.
  const roots = ["lib", "app"].map((d) => join(process.cwd(), d));
  const offenders: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== ".next") walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      const source = readFileSync(full, "utf8");
      // `access_token` as a URL parameter. Meta's own debug_token spec uses
      // `input_token` in the query string and has no header form, so that one
      // documented server-to-server exception is not matched here.
      if (/[?&]access_token=/.test(source)) offenders.push(full);
    }
  };
  roots.forEach(walk);

  assert.deepEqual(offenders, [], `access token found in a URL in: ${offenders.join(", ")}`);
});

// ─── New credentials must never be stored unprotected ────────────────────────

test("isEncryptionConfigured reports whether a token can actually be protected", () => {
  const previous = process.env.ENCRYPTION_KEY;
  try {
    delete process.env.ENCRYPTION_KEY;
    assert.equal(isEncryptionConfigured(), false);
    // This is the condition the connect route refuses on: without a key,
    // encryptSecret returns its input unchanged.
    assert.equal(encryptSecret("EAA_TOKEN"), "EAA_TOKEN");

    process.env.ENCRYPTION_KEY = "a-test-passphrase";
    assert.equal(isEncryptionConfigured(), true);
    const sealed = encryptSecret("EAA_TOKEN");
    assert.equal(sealed.startsWith("enc:v1:"), true);
    assert.equal(sealed.includes("EAA_TOKEN"), false);
  } finally {
    if (previous === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = previous;
  }
});

test("a business connected through Embedded Signup reports its live numbers", () => {
  const business = {
    id: "biz_2",
    tenantId: "tenant_1",
    name: "Acme",
    slug: "acme",
    whatsappPhoneNumber: null,
    whatsappPhoneNumberId: null,
    whatsappBusinessId: null,
    whatsappAccessToken: null,
    whatsappVerifyToken: null,
    whatsappAppSecret: null,
    // Only the public columns are ever selected into this relation.
    whatsappIntegrations: [
      { id: "wai_1", phoneNumberId: "109876543210987", isActive: true, isDefault: true },
      { id: "wai_2", phoneNumberId: "109876543210988", isActive: true, isDefault: false },
    ],
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projected = publicBusiness(business as any);

  // Connected despite every legacy column being null — this is the case that used
  // to render "No number" on a business that had just finished Embedded Signup.
  assert.equal(projected.whatsappConnected, true);
  assert.equal(projected.whatsappNumberCount, 2);
  assert.equal(projected.hasWhatsappToken, false);
});
