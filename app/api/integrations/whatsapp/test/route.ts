// ============================================================================
// ROUTE  : /api/integrations/whatsapp/test
// POST   - Verify one WhatsApp number's stored credentials against Meta.
//
// ACCESS - Authenticated, tenant-scoped, manager roles only.
//
// Body: { integrationId } tests exactly that number with its own decrypted
// token, and refreshes the Meta details shown for it (display name, number,
// quality rating, verification status) — the stored values are a snapshot from
// connect time, and this is the moment we are talking to Meta anyway.
//
// Without an integrationId the business's default sender is tested — resolved by
// resolveWhatsAppCreds(), the same function campaigns and templates send with,
// so a green result there means a campaign send would genuinely work. That is
// also the path for businesses that only have hand-entered legacy credentials.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getBusinessScope, resolveWhatsAppCreds } from "@/lib/business";
import { decryptSecret, isMetaAccessToken } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { getPhoneNumberDetails, MetaApiError } from "@/lib/whatsapp";
import { testWhatsAppSchema } from "@/lib/validators/whatsappIntegration";

const MANAGER_ROLES = new Set(["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"]);

export async function POST(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!MANAGER_ROLES.has(scope.role)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  // The body is optional — an empty POST tests the caller's current business.
  let body: unknown = {};
  try {
    const raw = await req.text();
    if (raw) body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = testWhatsAppSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const { integrationId, businessId } = parsed.data;

  let phoneNumberId: string | null;
  let wabaId: string | null;
  let apiKey: string | null;

  if (integrationId) {
    // Tenant isolation lives in this where clause.
    const integration = await prisma.whatsAppIntegration.findFirst({
      where: { id: integrationId, tenantId: scope.tenantId },
    });
    if (!integration || (businessId && integration.businessId !== businessId)) {
      return NextResponse.json({ success: false, error: "WhatsApp number not found" }, { status: 404 });
    }
    if (!integration.isActive) {
      return NextResponse.json(
        { success: false, error: "This WhatsApp number is disconnected. Reconnect it through Meta first." },
        { status: 400 },
      );
    }

    phoneNumberId = integration.phoneNumberId;
    wabaId = integration.whatsappBusinessId;
    try {
      apiKey = decryptSecret(integration.accessToken);
    } catch {
      apiKey = null;
    }
    if (!apiKey || !isMetaAccessToken(apiKey)) {
      return NextResponse.json(
        { success: false, error: "The stored access token for this number is unusable. Reconnect it through Meta." },
        { status: 400 },
      );
    }
  } else {
    // Ownership is proved before the id reaches the resolver, which is tenant-agnostic by
    // design: it answers "what would this business send with", not "may you ask".
    if (businessId) {
      const owned = await prisma.business.findFirst({
        where: { id: businessId, tenantId: scope.tenantId },
        select: { id: true },
      });
      if (!owned) {
        return NextResponse.json({ success: false, error: "Business not found" }, { status: 404 });
      }
    }

    const creds = await resolveWhatsAppCreds(businessId ?? scope.businessId);
    if (!creds.phoneNumberId || !creds.apiKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            creds.unavailableReason ??
            "No usable WhatsApp credentials for this business. Connect WhatsApp first.",
        },
        { status: 400 },
      );
    }
    phoneNumberId = creds.phoneNumberId;
    wabaId = creds.businessAccountId;
    apiKey = creds.apiKey;
  }

  try {
    const details = await getPhoneNumberDetails(phoneNumberId, apiKey);

    if (integrationId) {
      // Refresh the snapshot the settings card shows. Only overwrite what Meta returned.
      await prisma.whatsAppIntegration.update({
        where: { id: integrationId },
        data: {
          ...(details.verified_name && { displayName: details.verified_name }),
          ...(details.display_phone_number && { phoneNumber: details.display_phone_number }),
          ...(details.quality_rating && { qualityRating: details.quality_rating }),
          ...(details.code_verification_status && {
            codeVerificationStatus: details.code_verification_status,
          }),
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        integrationId: integrationId ?? null,
        phoneNumberId,
        wabaId,
        displayPhoneNumber: details.display_phone_number ?? null,
        verifiedName: details.verified_name ?? null,
        qualityRating: details.quality_rating ?? null,
        codeVerificationStatus: details.code_verification_status ?? null,
      },
    });
  } catch (error) {
    // Meta rejecting the credentials is a 400 the operator can act on; not reaching Meta
    // at all is a 502 they cannot. Collapsing the two would have every expired token
    // reported as an outage.
    if (error instanceof MetaApiError) {
      return NextResponse.json(
        { success: false, error: error.metaMessage },
        { status: error.status >= 500 ? 502 : 400 },
      );
    }
    console.error("[WA TEST] Could not reach Meta", {
      integrationId: integrationId ?? null,
      businessId: businessId ?? scope.businessId,
      reason: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json(
      { success: false, error: "Could not reach the WhatsApp Cloud API" },
      { status: 502 },
    );
  }
}
