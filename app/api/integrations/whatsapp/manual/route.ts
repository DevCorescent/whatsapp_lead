// ============================================================================
// ROUTE  : /api/integrations/whatsapp/manual
// POST   - Connect a WhatsApp number using credentials entered by hand.
//
// ACCESS - Authenticated, tenant-scoped, manager roles only.
//
// Unlike the Embedded Signup path, this route accepts a permanent access token
// directly from the user. It validates the token against Meta, then saves the
// number as a WhatsAppIntegration row — the same storage as Embedded Signup, so
// the number shows up in the list with Test, Rename, and Disconnect.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBusinessScope } from "@/lib/business";
import { encryptSecret, isEncryptionConfigured, isMetaAccessToken, sanitizeWhatsAppToken } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { MetaApiError } from "@/lib/whatsapp";
import {
  debugBusinessToken,
  listWabaPhoneNumbers,
  registerPhoneNumber,
  selectPhoneNumber,
  subscribeAppToWaba,
} from "@/lib/whatsappEmbeddedSignup";
import { claimIntegration, syncLegacyIntegration } from "@/lib/whatsappIntegrations";

const MANAGER_ROLES = new Set(["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"]);

const manualConnectSchema = z.object({
  accessToken: z.string().min(10, "Access token is required"),
  phoneNumberId: z.string().min(1, "Phone Number ID is required"),
  wabaId: z.string().min(1, "WhatsApp Business Account ID is required"),
  businessId: z.string().optional(),
});

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

  if (!isEncryptionConfigured()) {
    return NextResponse.json(
      {
        success: false,
        error:
          "WhatsApp cannot be connected because this deployment has no encryption key configured. Ask an administrator to set ENCRYPTION_KEY.",
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

  const parsed = manualConnectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }
  const { accessToken: rawToken, phoneNumberId, wabaId, businessId } = parsed.data;

  const sanitized = sanitizeWhatsAppToken(rawToken);
  if (!sanitized || !isMetaAccessToken(sanitized)) {
    return NextResponse.json(
      { success: false, error: "That does not look like a valid Meta access token. Check that you copied it in full." },
      { status: 400 },
    );
  }
  const token: string = sanitized;

  const business = businessId
    ? await prisma.business.findFirst({ where: { id: businessId, tenantId: scope.tenantId } })
    : scope.business;
  if (!business) {
    return NextResponse.json({ success: false, error: "Business not found" }, { status: 404 });
  }

  try {
    // ── 1. Verify the token is valid ─────────────────────────────────────────
    const debugged = await debugBusinessToken(token);
    if (!debugged.isValid) {
      return NextResponse.json(
        { success: false, error: "Meta says this access token is invalid or expired. Check the token and try again." },
        { status: 400 },
      );
    }

    // ── 2. Get phone number details from Meta ─────────────────────────────────
    const numbers = await listWabaPhoneNumbers(wabaId, token);
    const phoneChoice = selectPhoneNumber(numbers, phoneNumberId);

    let displayName: string | null = null;
    let displayPhoneNumber: string | null = null;
    let qualityRating: string | null = null;
    let codeVerificationStatus: string | null = null;
    let resolvedPhoneNumberId = phoneNumberId;

    if (phoneChoice.ok) {
      const phone = phoneChoice.phone;
      resolvedPhoneNumberId = phone.id;
      displayName = phone.verified_name ?? business.name;
      displayPhoneNumber = phone.display_phone_number ?? null;
      qualityRating = phone.quality_rating ?? null;
      codeVerificationStatus = phone.code_verification_status ?? null;
    } else {
      // Could not list numbers — use what the user entered as-is.
      // This covers tokens that lack the phone listing permission but can still send.
      displayName = business.name;
      console.warn("[WA MANUAL] Could not list phone numbers from WABA", {
        businessId: business.id,
        wabaId,
        reason: phoneChoice.reason,
      });
    }

    // ── 3. Mirror any existing legacy number first ────────────────────────────
    await syncLegacyIntegration(business.id);

    // ── 4. Save this number as its own integration ───────────────────────────
    const claim = await claimIntegration({
      tenantId: scope.tenantId,
      businessId: business.id,
      phoneNumberId: resolvedPhoneNumberId,
      whatsappBusinessId: wabaId,
      encryptedToken: encryptSecret(token),
      displayName,
      phoneNumber: displayPhoneNumber,
      qualityRating,
      codeVerificationStatus,
    });

    if (!claim.ok) {
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

    // ── 5. Optional steps — non-fatal ────────────────────────────────────────
    const warnings: string[] = [];

    try {
      await subscribeAppToWaba(wabaId, token);
    } catch (error) {
      console.error("[WA MANUAL] Webhook subscription failed", {
        businessId: business.id,
        meta: error instanceof MetaApiError ? error.metaMessage : "transport failure",
      });
      warnings.push(
        "Credentials saved, but Meta did not accept the webhook subscription — incoming messages may not arrive. Try Test Connection, or re-enter credentials.",
      );
    }

    const registration = await registerPhoneNumber(resolvedPhoneNumberId, token);
    if (registration.attempted && registration.error) {
      console.warn("[WA MANUAL] Phone registration error", {
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

    console.log("[WA MANUAL] Connected via manual credentials", {
      businessId: business.id,
      tenantId: scope.tenantId,
      phoneNumberId: resolvedPhoneNumberId,
      integrationId: integration.id,
      created: claim.created,
      warnings: warnings.length,
    });

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
      warnings,
    });
  } catch (error) {
    if (error instanceof MetaApiError) {
      console.error("[WA MANUAL] Meta rejected the request", {
        businessId: business.id,
        tenantId: scope.tenantId,
        status: error.status,
        meta: error.metaMessage,
      });
      return NextResponse.json(
        { success: false, error: `Meta rejected the connection: ${error.metaMessage}` },
        { status: error.status >= 500 ? 502 : 400 },
      );
    }

    console.error("[WA MANUAL] Failed", {
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
