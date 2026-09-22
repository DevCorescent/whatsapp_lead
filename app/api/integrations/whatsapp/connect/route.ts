// ============================================================================
// ROUTE  : /api/integrations/whatsapp/connect
// POST   - Complete Meta's Embedded Signup and store the number as a
//          WhatsAppIntegration of a Business (one row per connected number).
//
// ACCESS - Authenticated, tenant-scoped, manager roles only (same allowlist as
//          the Businesses endpoints — connecting a number is a billing-relevant
//          change to the workspace, not an agent action).
//
// The browser sends three things: the single-use authorization `code` from the
// Facebook Login for Business callback, and the `waba_id` / `phone_number_id`
// Meta reported over postMessage. Only the first of those is trusted, and only
// because it is useless to anyone who cannot also present our app secret.
//
//   code         → exchanged server-side for a customer-scoped business token
//   waba_id      → discarded unless debug_token says the token can reach it
//   phone_number → discarded unless it is listed on that WABA
//
// The code expires thirty seconds after Meta issues it, so the exchange happens
// inline on this request. Everything after the exchange is ordered so that the
// credentials are durably saved before any optional step runs: a failure to
// subscribe webhooks is recoverable from the settings screen, whereas a failure
// before the save would strand the customer with a spent code and force them
// through Meta's entire dialog again.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getBusinessScope } from "@/lib/business";
import {
  encryptSecret,
  isEncryptionConfigured,
  isMetaAccessToken,
  sanitizeWhatsAppToken,
} from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { MetaApiError } from "@/lib/whatsapp";
import {
  debugBusinessToken,
  exchangeCodeForBusinessToken,
  getWabaDetails,
  listWabaPhoneNumbers,
  missingEmbeddedSignupEnv,
  registerPhoneNumber,
  selectPhoneNumber,
  selectWaba,
  subscribeAppToWaba,
} from "@/lib/whatsappEmbeddedSignup";
import { connectWhatsAppSchema } from "@/lib/validators/whatsappIntegration";
import { claimIntegration, syncLegacyIntegration } from "@/lib/whatsappIntegrations";

/** Roles allowed to connect or disconnect a channel — mirrors /api/businesses. */
const MANAGER_ROLES = new Set(["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"]);

export async function POST(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!MANAGER_ROLES.has(scope.role)) {
    return NextResponse.json(
      { success: false, error: "You don't have permission to connect WhatsApp" },
      { status: 403 },
    );
  }

  // Ahead of parsing: an unconfigured deployment cannot complete this for any payload,
  // and the operator needs to be told which variables are missing rather than watching
  // Meta reject the exchange for reasons that look like the customer's fault.
  const missing = missingEmbeddedSignupEnv();
  if (missing.length > 0) {
    console.error("[WA CONNECT] Embedded Signup is not configured", { missing });
    return NextResponse.json(
      {
        success: false,
        error: `WhatsApp onboarding is not configured on this deployment (missing ${missing.join(", ")}). Ask an administrator to finish Meta app setup.`,
      },
      { status: 503 },
    );
  }

  // Refuse before the exchange rather than store an unprotected token after it.
  //
  // encryptSecret() returns its input unchanged when ENCRYPTION_KEY is unset — tolerance
  // that exists so workspaces predating encryption keep working. On this path it would
  // mean minting a brand-new Meta token and writing it to the database in plaintext,
  // while the card the customer just used says their token is encrypted before storage.
  // Failing loudly is the only honest option; the check is here, ahead of the code
  // exchange, so the customer's single-use code is not spent on a connection that cannot
  // be stored safely. Legacy read paths are untouched and still accept plaintext rows.
  if (!isEncryptionConfigured()) {
    console.error("[WA CONNECT] Refused: ENCRYPTION_KEY is not configured", {
      businessId: scope.businessId,
      tenantId: scope.tenantId,
    });
    return NextResponse.json(
      {
        success: false,
        error:
          "WhatsApp cannot be connected because this deployment has no encryption key configured, and the access token would be stored unprotected. Ask an administrator to set ENCRYPTION_KEY.",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = connectWhatsAppSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }
  const { code, wabaId: claimedWabaId, phoneNumberId: claimedPhoneId, businessId } = parsed.data;

  // Tenant isolation: an explicit businessId is only ever honoured when the caller's own
  // tenant owns it. Without the tenantId in this where clause, a valid session plus a
  // guessed id would connect a WhatsApp number to another customer's workspace.
  const business = businessId
    ? await prisma.business.findFirst({ where: { id: businessId, tenantId: scope.tenantId } })
    : scope.business;
  if (!business) {
    return NextResponse.json({ success: false, error: "Business not found" }, { status: 404 });
  }

  try {
    // ── 1. Exchange the code (30-second TTL) for a customer-scoped business token ──
    const businessToken = await exchangeCodeForBusinessToken(code);

    // resolveWhatsAppCreds() refuses any stored token that does not look like a Meta
    // token, and it refuses it silently — a send simply never happens. Storing something
    // it will later discard would leave the UI reading "Connected" over a channel that
    // cannot send, so the shape is checked here, where it can still be reported.
    if (!isMetaAccessToken(sanitizeWhatsAppToken(businessToken))) {
      console.error("[WA CONNECT] Exchanged token is not in the expected Meta format", {
        businessId: business.id,
        tenantId: scope.tenantId,
      });
      return NextResponse.json(
        {
          success: false,
          error:
            "Meta returned an access token in an unexpected format, so nothing was saved. Please try again, or contact support if it keeps happening.",
        },
        { status: 502 },
      );
    }

    // ── 2. Ask Meta what that token is actually allowed to reach ──
    const debugged = await debugBusinessToken(businessToken);
    if (!debugged.isValid) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Meta issued a token that is no longer valid. Please run the connection again.",
        },
        { status: 400 },
      );
    }
    // The browser's claimed waba_id is a hint, honoured only when Meta's own granular
    // scopes confirm it. See selectWaba() for why a mismatch is refused rather than
    // silently redirected to a WABA the customer did not choose.
    const wabaChoice = selectWaba(debugged.wabaIds, claimedWabaId);
    if (!wabaChoice.ok) {
      console.error("[WA CONNECT] WABA rejected", {
        businessId: business.id,
        tenantId: scope.tenantId,
        reason: wabaChoice.reason,
        scopes: debugged.scopes,
      });
      return NextResponse.json(
        {
          success: false,
          error:
            wabaChoice.reason === "no-grants"
              ? "No WhatsApp Business Account was shared with this app. In Meta's dialog, make sure a WhatsApp Business Account is selected and its permissions are granted."
              : "The WhatsApp Business Account reported by the browser was not among the accounts Meta authorised. Please run the connection again.",
        },
        { status: wabaChoice.reason === "no-grants" ? 400 : 403 },
      );
    }
    const wabaId = wabaChoice.wabaId;

    // ── 3. Verify the phone number really belongs to that WABA, and learn its details ──
    const numbers = await listWabaPhoneNumbers(wabaId, businessToken);
    const phoneChoice = selectPhoneNumber(numbers, claimedPhoneId);
    if (!phoneChoice.ok) {
      console.error("[WA CONNECT] Phone number rejected", {
        businessId: business.id,
        tenantId: scope.tenantId,
        reason: phoneChoice.reason,
      });
      return NextResponse.json(
        {
          success: false,
          error:
            phoneChoice.reason === "none"
              ? "That WhatsApp Business Account has no phone number yet. Add and verify a number in Meta, then connect again."
              : "The phone number reported by the browser does not belong to the authorised WhatsApp Business Account. Please run the connection again.",
        },
        { status: phoneChoice.reason === "none" ? 400 : 403 },
      );
    }
    const phone = phoneChoice.phone;

    // Best-effort label for the UI; a connection is valid without it.
    const waba = await getWabaDetails(wabaId, businessToken);

    // ── 4. Keep an existing hand-entered number as its own row ──
    // A business that already sends through legacy credentials gets that number mirrored
    // into a WhatsAppIntegration first, so it stays the default and keeps its threads.
    // Without this, the first Meta-connected number would become the default and quietly
    // take over sending from the number the business's customers already know.
    await syncLegacyIntegration(business.id);

    // ── 5. Save this number as its own integration ──
    // One row per phone_number_id, globally: connecting another number adds a row,
    // reconnecting a number refreshes its row in place, and a number held by another
    // business is refused. Save happens before any optional step below, because the
    // authorization code is already spent.
    const claim = await claimIntegration({
      tenantId: scope.tenantId,
      businessId: business.id,
      phoneNumberId: phone.id,
      whatsappBusinessId: wabaId,
      // Stored encrypted, never plaintext.
      encryptedToken: encryptSecret(businessToken),
      displayName: phone.verified_name ?? business.name,
      phoneNumber: phone.display_phone_number ?? null,
      qualityRating: phone.quality_rating ?? null,
      codeVerificationStatus: phone.code_verification_status ?? null,
    });

    if (!claim.ok) {
      // Whether the clash is inside this tenant decides how much can be said about it:
      // naming another tenant's workspace would leak the existence of their account.
      return NextResponse.json(
        {
          success: false,
          error:
            claim.sameTenant && claim.ownerBusinessName
              ? `That WhatsApp number is already connected to "${claim.ownerBusinessName}". Disconnect it there first.`
              : "That WhatsApp number is already connected to another workspace.",
        },
        { status: 409 },
      );
    }
    const integration = claim.integration;

    // ── 6. Optional steps. Reported, never fatal. ──
    const warnings: string[] = [];

    try {
      await subscribeAppToWaba(wabaId, businessToken);
    } catch (error) {
      // Sending will work and receiving will not — the one failure most easily mistaken
      // for a healthy connection, so it is surfaced rather than logged and forgotten.
      console.error("[WA CONNECT] Webhook subscription failed", {
        businessId: business.id,
        meta: error instanceof MetaApiError ? error.metaMessage : "transport failure",
      });
      warnings.push(
        "Credentials saved, but Meta did not accept the webhook subscription — incoming messages may not arrive. Try Test Connection, or reconnect.",
      );
    }

    const registration = await registerPhoneNumber(phone.id, businessToken);
    if (registration.attempted && registration.error) {
      console.warn("[WA CONNECT] Phone registration reported an error", {
        businessId: business.id,
        meta: registration.error,
      });
      warnings.push(`Meta could not register the number for Cloud API: ${registration.error}`);
    }

    await prisma.auditLog.create({
      data: {
        tenantId: scope.tenantId,
        userId: scope.userId,
        action: "WHATSAPP_CONNECTED",
        resource: "whatsapp_integration",
        resourceId: integration.id,
      },
    });

    console.log("[WA CONNECT] Connected via Embedded Signup", {
      businessId: business.id,
      tenantId: scope.tenantId,
      phoneNumberId: phone.id,
      integrationId: integration.id,
      created: claim.created,
      wabaId,
      warnings: warnings.length,
    });

    // Only non-secret values cross back to the browser. The token is never echoed.
    return NextResponse.json({
      success: true,
      data: {
        integration: {
          id: integration.id,
          displayName: integration.displayName,
          phoneNumber: integration.phoneNumber,
          phoneNumberId: integration.phoneNumberId,
          whatsappBusinessId: integration.whatsappBusinessId,
          qualityRating: integration.qualityRating,
          codeVerificationStatus: integration.codeVerificationStatus,
          isActive: integration.isActive,
          isDefault: integration.isDefault,
        },
        created: claim.created,
      },
      connection: {
        wabaId,
        wabaName: waba?.name ?? null,
        phoneNumberId: phone.id,
        displayPhoneNumber: phone.display_phone_number ?? null,
        verifiedName: phone.verified_name ?? null,
        qualityRating: phone.quality_rating ?? null,
        codeVerificationStatus: phone.code_verification_status ?? null,
      },
      warnings,
    });
  } catch (error) {
    // Meta's own message is the operator's best clue (expired code, revoked permission,
    // app not approved), so it is passed through — it describes the request, not our secrets.
    if (error instanceof MetaApiError) {
      console.error("[WA CONNECT] Meta rejected the onboarding", {
        businessId: business.id,
        tenantId: scope.tenantId,
        status: error.status,
        code: error.code,
        meta: error.metaMessage,
      });
      return NextResponse.json(
        { success: false, error: `Meta rejected the connection: ${error.metaMessage}` },
        { status: error.status >= 500 ? 502 : 400 },
      );
    }

    // Only the message, never the error object: a rejected Prisma write can carry the
    // arguments it was called with, and one of those arguments is the encrypted token.
    console.error("[WA CONNECT] Failed", {
      businessId: business.id,
      tenantId: scope.tenantId,
      reason: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json(
      { success: false, error: "Could not complete the WhatsApp connection. Please try again." },
      { status: 500 },
    );
  }
}
