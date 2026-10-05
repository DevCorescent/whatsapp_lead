// ============================================================================
// ROUTE : /api/admin/tenants/[id]/whatsapp
//
// GET  - One account's WhatsApp connections, per business: every connected
//        number (WhatsAppIntegration — where Embedded Signup and manual connect
//        store them), numbers still only in the legacy Business / TenantSettings
//        columns, template counts and the last message on each number.
// POST - { action: "check" | "syncTemplates" | "disconnect", integrationId?, businessId? }
//        check         - ask Meta for the number's live status and refresh it here
//        syncTemplates - pull the business's templates and statuses from Meta
//        disconnect    - disconnect the number (as the account's own Disconnect does)
//
// SUPER_ADMIN only. Tokens and secrets never leave the server: the list uses
// PUBLIC_INTEGRATION_SELECT and legacy secrets are reported as booleans.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptSecret, hasSecret, isMetaAccessToken } from "@/lib/crypto";
import { getPhoneNumberDetails } from "@/lib/whatsapp";
import { PUBLIC_INTEGRATION_SELECT, disconnectIntegration } from "@/lib/whatsappIntegrations";
import { importTemplatesFromMeta, TemplateCredsError } from "@/lib/templates";

type Params = { params: Promise<{ id: string }> };

const postSchema = z.object({
  action: z.enum(["check", "syncTemplates", "disconnect"]),
  integrationId: z.string().min(1).optional(),
  businessId: z.string().min(1).optional(),
});

async function superAdmin() {
  const session = await auth();
  if (!session?.user) return { error: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
  if (session.user.role !== "SUPER_ADMIN") {
    return { error: NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }) };
  }
  return { user: session.user, homeTenantId: session.user.viewAs?.homeTenantId ?? session.user.tenantId };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await superAdmin();
  if (error) return error;
  const { id } = await params;

  const tenant = await prisma.tenant.findUnique({ where: { id }, select: { id: true } });
  if (!tenant) return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 });

  try {
    const [businesses, integrations, settings, templates, lastActivity] = await Promise.all([
      prisma.business.findMany({
        where: { tenantId: id },
        select: {
          id: true,
          name: true,
          whatsappPhoneNumber: true,
          whatsappPhoneNumberId: true,
          whatsappBusinessId: true,
          whatsappAccessToken: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.whatsAppIntegration.findMany({
        where: { tenantId: id },
        select: PUBLIC_INTEGRATION_SELECT,
        orderBy: [{ isActive: "desc" }, { isDefault: "desc" }, { createdAt: "asc" }],
      }),
      prisma.tenantSettings.findUnique({
        where: { tenantId: id },
        select: { waPhoneNumberId: true, waBusinessAccountId: true, waApiKey: true },
      }),
      prisma.messageTemplate.groupBy({ by: ["businessId", "status"], where: { tenantId: id }, _count: { _all: true } }),
      prisma.conversation.groupBy({
        by: ["whatsappIntegrationId"],
        where: { tenantId: id, whatsappIntegrationId: { not: null } },
        _max: { lastMessageAt: true },
        _count: { _all: true },
      }),
    ]);

    const activity = new Map(lastActivity.map((a) => [a.whatsappIntegrationId, a]));
    const linked = new Set(integrations.map((i) => i.phoneNumberId));

    const data = businesses.map((b) => {
      const counts = templates.filter((t) => t.businessId === b.id);
      const count = (statuses: string[]) =>
        counts.filter((t) => statuses.includes(t.status)).reduce((n, t) => n + t._count._all, 0);
      return {
        id: b.id,
        name: b.name,
        numbers: integrations
          .filter((i) => i.businessId === b.id)
          .map((i) => ({
            ...i,
            conversations: activity.get(i.id)?._count._all ?? 0,
            lastMessageAt: activity.get(i.id)?._max.lastMessageAt ?? null,
          })),
        // Credentials saved the old way that never made it into a WhatsAppIntegration row.
        legacy:
          b.whatsappPhoneNumberId && !linked.has(b.whatsappPhoneNumberId)
            ? {
                phoneNumber: b.whatsappPhoneNumber,
                phoneNumberId: b.whatsappPhoneNumberId,
                whatsappBusinessId: b.whatsappBusinessId,
                hasToken: hasSecret(b.whatsappAccessToken),
              }
            : null,
        templates: {
          approved: count(["APPROVED"]),
          inReview: count(["SUBMITTED", "PENDING"]),
          other: count(["DRAFT", "REJECTED", "DISABLED"]),
        },
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        businesses: data,
        accountSettings:
          settings?.waPhoneNumberId && !linked.has(settings.waPhoneNumberId)
            ? {
                phoneNumberId: settings.waPhoneNumberId,
                whatsappBusinessId: settings.waBusinessAccountId,
                hasToken: hasSecret(settings.waApiKey),
              }
            : null,
      },
    });
  } catch (err) {
    console.error("[ADMIN TENANT WHATSAPP GET]", err);
    return NextResponse.json({ success: false, error: "Failed to load WhatsApp details" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const { user, homeTenantId, error } = await superAdmin();
  if (error) return error;
  const { id } = await params;

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
  const { action, integrationId, businessId } = parsed.data;

  const audit = (auditAction: string, resourceId: string, metadata?: Record<string, unknown>) =>
    prisma.auditLog.create({
      data: {
        tenantId: homeTenantId!,
        userId: user!.id,
        action: auditAction,
        resource: "whatsapp_integration",
        resourceId,
        metadata: { accountId: id, ...metadata },
      },
    });

  try {
    if (action === "syncTemplates") {
      const business = businessId
        ? await prisma.business.findFirst({ where: { id: businessId, tenantId: id }, select: { id: true } })
        : null;
      if (!business) return NextResponse.json({ success: false, error: "Business not found" }, { status: 404 });
      const result = await importTemplatesFromMeta(business.id, id);
      await audit("ADMIN_TEMPLATES_SYNCED", business.id, result);
      return NextResponse.json({ success: true, data: result });
    }

    // "check" and "disconnect" act on one connected number of this account.
    const integration = integrationId
      ? await prisma.whatsAppIntegration.findFirst({ where: { id: integrationId, tenantId: id } })
      : null;
    if (!integration) return NextResponse.json({ success: false, error: "WhatsApp number not found" }, { status: 404 });

    if (action === "disconnect") {
      const result = await disconnectIntegration({
        tenantId: id,
        businessId: integration.businessId,
        integrationId: integration.id,
      });
      if (!result.ok) return NextResponse.json({ success: false, error: "WhatsApp number not found" }, { status: 404 });
      if (!result.alreadyDisconnected) await audit("ADMIN_WHATSAPP_DISCONNECTED", integration.id);
      return NextResponse.json({ success: true, data: { alreadyDisconnected: result.alreadyDisconnected } });
    }

    // check
    if (!integration.isActive) {
      return NextResponse.json({ success: false, error: "This number is disconnected." }, { status: 400 });
    }
    let apiKey: string | null = null;
    try {
      apiKey = decryptSecret(integration.accessToken);
    } catch {
      apiKey = null;
    }
    if (!apiKey || !isMetaAccessToken(apiKey)) {
      return NextResponse.json(
        { success: false, error: "The stored access token is unusable. The account must reconnect this number through Meta." },
        { status: 400 },
      );
    }
    const details = await getPhoneNumberDetails(integration.phoneNumberId, apiKey);
    await prisma.whatsAppIntegration.update({
      where: { id: integration.id },
      data: {
        ...(details.verified_name && { displayName: details.verified_name }),
        ...(details.display_phone_number && { phoneNumber: details.display_phone_number }),
        ...(details.quality_rating && { qualityRating: details.quality_rating }),
        ...(details.code_verification_status && { codeVerificationStatus: details.code_verification_status }),
      },
    });
    return NextResponse.json({ success: true, data: details });
  } catch (err) {
    if (err instanceof TemplateCredsError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    console.error("[ADMIN TENANT WHATSAPP POST]", err);
    const message = err instanceof Error ? err.message : "Request failed";
    return NextResponse.json({ success: false, error: `Meta said: ${message}` }, { status: 502 });
  }
}
