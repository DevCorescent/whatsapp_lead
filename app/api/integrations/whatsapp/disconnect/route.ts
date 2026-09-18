// ============================================================================
// ROUTE  : /api/integrations/whatsapp/disconnect
// POST   - Disconnect ONE WhatsApp number from a Business.
//
// ACCESS - Authenticated, tenant-scoped, manager roles only.
//
// Body: { integrationId } — the number to disconnect. Every other number of the
// business keeps sending and receiving. The integration is looked up inside the
// caller's tenant, so an id from another workspace is indistinguishable from one
// that does not exist.
//
// What disconnecting does (lib/whatsappIntegrations.ts#disconnectIntegration):
//   · tells Meta to stop sending this WABA's webhooks, unless another connected
//     number still uses the same WABA;
//   · marks the row inactive and wipes its token — the row itself is kept so the
//     threads that lived on this number refuse to send rather than answer
//     customers from a different number;
//   · promotes another number to default when the default was disconnected;
//   · clears the legacy Business / TenantSettings columns when they describe
//     this same number, so the fallback path cannot keep using it.
// Contacts, conversations, campaigns, templates, knowledge and AI settings are
// never touched.
//
// Legacy body: { businessId } with no integrationId is still accepted for a
// business that has never had a connected number, and clears its hand-entered
// credentials exactly as before.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getBusinessScope, publicBusiness } from "@/lib/business";
import { invalidateCredsCache, invalidateTenantCache } from "@/lib/cache";
import { decryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { MetaApiError } from "@/lib/whatsapp";
import { unsubscribeAppFromWaba } from "@/lib/whatsappEmbeddedSignup";
import { disconnectIntegration } from "@/lib/whatsappIntegrations";
import { disconnectWhatsAppSchema } from "@/lib/validators/whatsappIntegration";

const MANAGER_ROLES = new Set(["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"]);

export async function POST(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!MANAGER_ROLES.has(scope.role)) {
    return NextResponse.json(
      { success: false, error: "You don't have permission to disconnect WhatsApp" },
      { status: 403 },
    );
  }

  let body: unknown = {};
  try {
    const raw = await req.text();
    if (raw) body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = disconnectWhatsAppSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const { integrationId, businessId } = parsed.data;

  // ── Per-number disconnect ──────────────────────────────────────────────────
  if (integrationId) {
    // Tenant isolation lives in this where clause.
    const integration = await prisma.whatsAppIntegration.findFirst({
      where: { id: integrationId, tenantId: scope.tenantId },
      select: { id: true, businessId: true, phoneNumberId: true },
    });
    if (!integration || (businessId && integration.businessId !== businessId)) {
      return NextResponse.json({ success: false, error: "WhatsApp number not found" }, { status: 404 });
    }

    try {
      const result = await disconnectIntegration({
        tenantId: scope.tenantId,
        businessId: integration.businessId,
        integrationId: integration.id,
      });
      if (!result.ok) {
        return NextResponse.json({ success: false, error: "WhatsApp number not found" }, { status: 404 });
      }

      if (!result.alreadyDisconnected) {
        await prisma.auditLog.create({
          data: {
            tenantId: scope.tenantId,
            userId: scope.userId,
            action: "WHATSAPP_DISCONNECTED",
            resource: "whatsapp_integration",
            resourceId: integration.id,
          },
        });
      }

      return NextResponse.json({
        success: true,
        data: {
          integrationId: integration.id,
          alreadyDisconnected: result.alreadyDisconnected,
          promotedIntegrationId: result.promotedIntegrationId,
        },
        warnings: result.warnings,
      });
    } catch (error) {
      console.error("[WA DISCONNECT] Failed", {
        integrationId: integration.id,
        tenantId: scope.tenantId,
        reason: error instanceof Error ? error.message : "unknown error",
      });
      return NextResponse.json(
        { success: false, error: "Could not disconnect WhatsApp. Please try again." },
        { status: 500 },
      );
    }
  }

  // ── Legacy: a business with hand-entered credentials only ──────────────────
  const business = businessId
    ? await prisma.business.findFirst({ where: { id: businessId, tenantId: scope.tenantId } })
    : scope.business;
  if (!business) {
    return NextResponse.json({ success: false, error: "Business not found" }, { status: 404 });
  }

  const connectedNumbers = await prisma.whatsAppIntegration.count({
    where: { businessId: business.id, isActive: true },
  });
  if (connectedNumbers > 0) {
    // Clearing "the business" would be ambiguous once it has numbers of its own.
    return NextResponse.json(
      { success: false, error: "Choose which WhatsApp number to disconnect." },
      { status: 400 },
    );
  }

  const warnings: string[] = [];

  // Tell Meta while we still hold a token that can say it. Best-effort: a revoked token is
  // the most common reason to be disconnecting, and must not leave the workspace stuck.
  if (business.whatsappBusinessId && business.whatsappAccessToken) {
    try {
      const token = decryptSecret(business.whatsappAccessToken);
      if (token) {
        await unsubscribeAppFromWaba(business.whatsappBusinessId, token);
      }
    } catch (error) {
      console.warn("[WA DISCONNECT] Could not unsubscribe webhooks", {
        businessId: business.id,
        meta: error instanceof MetaApiError ? error.metaMessage : "token unusable",
      });
      warnings.push(
        "Disconnected here, but Meta did not confirm the webhook unsubscribe. You can also remove this app under Meta Business Settings → WhatsApp accounts.",
      );
    }
  }

  try {
    const previousPhoneNumberId = business.whatsappPhoneNumberId;

    const updated = await prisma.business.update({
      where: { id: business.id },
      data: {
        whatsappAccessToken: null,
        whatsappBusinessId: null,
        whatsappPhoneNumberId: null,
        whatsappPhoneNumber: null,
      },
    });

    await invalidateCredsCache(updated.id);
    if (previousPhoneNumberId) {
      await invalidateTenantCache(previousPhoneNumberId);
    }

    await prisma.auditLog.create({
      data: {
        tenantId: scope.tenantId,
        userId: scope.userId,
        action: "WHATSAPP_DISCONNECTED",
        resource: "business",
        resourceId: updated.id,
      },
    });

    return NextResponse.json({ success: true, data: publicBusiness(updated), warnings });
  } catch (error) {
    console.error("[WA DISCONNECT] Failed", {
      businessId: business.id,
      tenantId: scope.tenantId,
      reason: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json(
      { success: false, error: "Could not disconnect WhatsApp. Please try again." },
      { status: 500 },
    );
  }
}
