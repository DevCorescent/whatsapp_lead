// ============================================================================
// ROUTE  : /api/businesses/[id]
// PATCH  - Update a business (identity, WhatsApp credentials, AI settings).
// DELETE - Remove a business and all of its data (cascade). The tenant's last
//          business cannot be deleted — a tenant must always own at least one.
//
// Ownership is enforced on every operation: the row is only touched when its
// tenantId matches the caller's, so one tenant can never edit another's business.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getBusinessScope, publicBusiness, CURRENT_BUSINESS_COOKIE } from "@/lib/business";
import { invalidateCredsCache, invalidateTenantCache } from "@/lib/cache";
import { prisma } from "@/lib/prisma";
import { encryptSecret, isMetaAccessToken, sanitizeWhatsAppToken } from "@/lib/crypto";
import { updateBusinessSchema } from "@/lib/validators/business";

type Params = { params: Promise<{ id: string }> };

const MANAGER_ROLES = new Set(["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"]);

export async function PATCH(req: NextRequest, { params }: Params) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.has(scope.role)) {
    return NextResponse.json({ success: false, error: "You don't have permission to edit businesses" }, { status: 403 });
  }

  const { id } = await params;

  const existing = await prisma.business.findFirst({ where: { id, tenantId: scope.tenantId } });
  if (!existing) return NextResponse.json({ success: false, error: "Business not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateBusinessSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { whatsappAccessToken, whatsappPhoneNumberId, logo, ...rest } = parsed.data;

  if (whatsappAccessToken) {
    const cleaned = sanitizeWhatsAppToken(whatsappAccessToken);
    if (!cleaned || !isMetaAccessToken(cleaned)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Access token must be a Meta WhatsApp token (starts with EAA…). Do not paste the business name, OpenRouter key, or phone number ID.",
        },
        { status: 400 },
      );
    }
  }

  // Keep the webhook routing key 1:1 — reject a phone_number_id owned by a different business.
  if (whatsappPhoneNumberId && whatsappPhoneNumberId !== existing.whatsappPhoneNumberId) {
    const taken = await prisma.business.findUnique({
      where: { whatsappPhoneNumberId },
      select: { id: true },
    });
    if (taken && taken.id !== id) {
      return NextResponse.json(
        { success: false, error: "That WhatsApp phone number ID is already connected to another business" },
        { status: 409 },
      );
    }
  }

  try {
    const business = await prisma.business.update({
      where: { id },
      data: {
        ...rest,
        ...(whatsappPhoneNumberId !== undefined && { whatsappPhoneNumberId: whatsappPhoneNumberId || null }),
        ...(logo !== undefined && { logo: logo || null }),
        // A new token is encrypted; an omitted/empty token leaves the stored one untouched.
        ...(whatsappAccessToken
          ? { whatsappAccessToken: encryptSecret(sanitizeWhatsAppToken(whatsappAccessToken)!) }
          : {}),
      },
    });

    // The row has changed; the cache still holds what it used to say. Both keys this business can
    // be reached under are dropped here, immediately after the write and before the response, so
    // the next webhook delivery and the next campaign send both resolve from Postgres.
    //
    // Placed ahead of the audit log deliberately: if that write were to fail, the cache would
    // otherwise be left describing credentials that no longer exist.
    await invalidateCredsCache(business.id);

    // The old number first. It is the entry that would keep routing inbound messages to this
    // business after it has stopped owning that number — and if the number has since been claimed
    // by another workspace, that is a cross-tenant misroute, not merely stale data.
    if (existing.whatsappPhoneNumberId) {
      await invalidateTenantCache(existing.whatsappPhoneNumberId);
    }

    // Then the new one, which may still be cached against whichever business held it before.
    if (
      business.whatsappPhoneNumberId &&
      business.whatsappPhoneNumberId !== existing.whatsappPhoneNumberId
    ) {
      await invalidateTenantCache(business.whatsappPhoneNumberId);
    }

    await prisma.auditLog.create({
      data: {
        tenantId: scope.tenantId,
        userId: scope.userId,
        action: "BUSINESS_UPDATED",
        resource: "business",
        resourceId: business.id,
      },
    });

    return NextResponse.json({ success: true, data: publicBusiness(business) });
  } catch (error) {
    console.error("[BUSINESSES PATCH]", error);
    return NextResponse.json({ success: false, error: "Failed to update business" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.has(scope.role)) {
    return NextResponse.json({ success: false, error: "You don't have permission to delete businesses" }, { status: 403 });
  }

  const { id } = await params;

  const existing = await prisma.business.findFirst({ where: { id, tenantId: scope.tenantId } });
  if (!existing) return NextResponse.json({ success: false, error: "Business not found" }, { status: 404 });

  // A tenant must always retain at least one business, or the whole CRM has no context.
  const count = await prisma.business.count({ where: { tenantId: scope.tenantId } });
  if (count <= 1) {
    return NextResponse.json(
      { success: false, error: "You can't delete your only business. Create another first." },
      { status: 400 },
    );
  }

  try {
    await prisma.business.delete({ where: { id } });

    // A cached entry now points at a business that no longer exists. `businessId` is a foreign key
    // on every Contact and Conversation the webhook creates, so leaving the routing entry in place
    // would not merely serve stale data — inbound messages for that number would fail the
    // constraint and be dropped until the TTL expired.
    await invalidateCredsCache(id);
    if (existing.whatsappPhoneNumberId) {
      await invalidateTenantCache(existing.whatsappPhoneNumberId);
    }

    await prisma.auditLog.create({
      data: {
        tenantId: scope.tenantId,
        userId: scope.userId,
        action: "BUSINESS_DELETED",
        resource: "business",
        resourceId: id,
      },
    });

    const res = NextResponse.json({ success: true });
    // If the deleted business was the active one, drop the cookie so the next
    // request re-resolves to the tenant's remaining default rather than a dead id.
    if (scope.businessId === id) {
      res.cookies.delete(CURRENT_BUSINESS_COOKIE);
    }
    return res;
  } catch (error) {
    console.error("[BUSINESSES DELETE]", error);
    return NextResponse.json({ success: false, error: "Failed to delete business" }, { status: 500 });
  }
}
