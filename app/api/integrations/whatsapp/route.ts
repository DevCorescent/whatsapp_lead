// ============================================================================
// ROUTE  : /api/integrations/whatsapp
// GET    - The WhatsApp numbers connected to a business (non-secret fields only).
//
// ACCESS - Authenticated members of the owning tenant. `?businessId=` is honoured
//          only when that business belongs to the caller's tenant.
//
// Tokens, verify tokens and app secrets are never selected, so they cannot reach
// the response — see PUBLIC_INTEGRATION_SELECT.
// ============================================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";
import { PUBLIC_INTEGRATION_SELECT } from "@/lib/whatsappIntegrations";

export async function GET(request: Request) {
  try {
    const scope = await getBusinessScope();
    if (!scope) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get("businessId") ?? scope.businessId;

    // Tenant isolation: a businessId from another tenant simply misses.
    const business = await prisma.business.findFirst({
      where: { id: businessId, tenantId: scope.tenantId },
      select: {
        id: true,
        name: true,
        whatsappPhoneNumberId: true,
        whatsappAccessToken: true,
      },
    });
    if (!business) {
      return NextResponse.json({ success: false, error: "Business not found" }, { status: 404 });
    }

    const integrations = await prisma.whatsAppIntegration.findMany({
      where: { tenantId: scope.tenantId, businessId: business.id },
      select: PUBLIC_INTEGRATION_SELECT,
      orderBy: [{ isActive: "desc" }, { isDefault: "desc" }, { createdAt: "asc" }],
    });

    // Hand-entered credentials that have not been mirrored into a row yet (the
    // backfill has not run, or the token is not a valid Meta token). Reported as a
    // boolean only, so the card can explain why a working business lists no number.
    const hasLegacyCredentials =
      Boolean(business.whatsappPhoneNumberId && business.whatsappAccessToken) &&
      !integrations.some((i) => i.phoneNumberId === business.whatsappPhoneNumberId);

    return NextResponse.json({
      success: true,
      data: {
        business: { id: business.id, name: business.name },
        integrations,
        hasLegacyCredentials,
      },
    });
  } catch (error) {
    console.error("[WA INTEGRATIONS] GET failed", {
      reason: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json(
      { success: false, error: "Could not load WhatsApp integrations" },
      { status: 500 },
    );
  }
}
