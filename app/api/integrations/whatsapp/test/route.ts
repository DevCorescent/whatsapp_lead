// ============================================================================
// ROUTE  : /api/integrations/whatsapp/test
// POST   - Verify a Business's stored WhatsApp credentials against Meta.
//
// ACCESS - Authenticated, tenant-scoped, manager roles only.
//
// This is the business-scoped counterpart to /api/settings/whatsapp/test, which
// can only ever test TenantSettings. Neither duplicates the other's work: both
// resolve credentials through the module that owns that decision — here
// resolveWhatsAppCreds(), the same function the campaign runner and the template
// service send with — and both then make the one Graph call that lives in
// lib/whatsapp.ts as getPhoneNumberDetails().
//
// Testing what the *sender* would resolve, rather than reading the row directly,
// is the point: it exercises the business→tenant fallback and the decryption
// path, so a green result here means a send would genuinely work.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getBusinessScope, resolveWhatsAppCreds } from "@/lib/business";
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

  const { businessId } = parsed.data;

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
        error: "No usable WhatsApp credentials for this business. Connect WhatsApp first.",
      },
      { status: 400 },
    );
  }

  try {
    const details = await getPhoneNumberDetails(creds.phoneNumberId, creds.apiKey);
    return NextResponse.json({
      success: true,
      data: {
        phoneNumberId: creds.phoneNumberId,
        wabaId: creds.businessAccountId,
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
      businessId: businessId ?? scope.businessId,
      reason: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json(
      { success: false, error: "Could not reach the WhatsApp Cloud API" },
      { status: 502 },
    );
  }
}
