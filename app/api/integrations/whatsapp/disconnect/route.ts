// ============================================================================
// ROUTE  : /api/integrations/whatsapp/disconnect
// POST   - Detach a Business from its WhatsApp connection.
//
// ACCESS - Authenticated, tenant-scoped, manager roles only.
//
// Disconnect clears exactly four columns: the access token, the WABA id, the
// phone number id and the display number. Nothing else on the business is
// touched — not its contacts, conversations, campaigns, templates, knowledge or
// AI settings — because a customer who is moving a number between workspaces, or
// re-running onboarding after a token was revoked, still owns all of that data.
// Deleting the business is a different, deliberate action with its own endpoint.
//
// Meta is told first, while the token is still available: once the row is
// cleared there is nothing left to authenticate an unsubscribe with, so the
// customer's WABA would go on delivering webhooks to an app that no longer has
// credentials for it.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getBusinessScope, publicBusiness } from "@/lib/business";
import { invalidateCredsCache, invalidateTenantCache } from "@/lib/cache";
import { decryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { MetaApiError } from "@/lib/whatsapp";
import { unsubscribeAppFromWaba } from "@/lib/whatsappEmbeddedSignup";
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

  // The body is optional — an empty POST disconnects the caller's current business.
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

  const { businessId } = parsed.data;
  const business = businessId
    ? await prisma.business.findFirst({ where: { id: businessId, tenantId: scope.tenantId } })
    : scope.business;
  if (!business) {
    return NextResponse.json({ success: false, error: "Business not found" }, { status: 404 });
  }

  const warnings: string[] = [];

  // Tell Meta while we still hold a token that can say it. Best-effort throughout: a
  // revoked or expired token is the most common reason to be disconnecting in the first
  // place, and refusing to clear the row because Meta will not talk to us would leave the
  // workspace permanently stuck with credentials it cannot use.
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

    // Both keys this business could be reached under. Without the routing drop, inbound
    // messages would keep resolving to a business whose credentials no longer exist —
    // and if the number is re-connected elsewhere, to the wrong workspace entirely.
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
