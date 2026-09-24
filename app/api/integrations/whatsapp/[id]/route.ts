// ============================================================================
// ROUTE  : /api/integrations/whatsapp/[id]
// PATCH  - Edit what belongs to us on a connected WhatsApp number.
//
// ACCESS - Authenticated, tenant-scoped, manager roles only — the same allowlist
//          as connect and disconnect, because the default number decides which
//          credentials every campaign sends with.
//
// Editable here:
//   displayName  the label operators read in the list
//   isDefault    which number this business sends from when nothing pins one
//
// Never editable here, by design:
//   phoneNumberId, whatsappBusinessId — Meta's identity for this connection.
//     Rewriting them by hand would point the row at an account the workspace
//     never authorised, while the stored token still belongs to the old one.
//   accessToken, verifyToken, appSecret — secrets. They are never sent to the
//     browser and cannot be set from it; they change only by reconnecting.
//   isActive — disconnecting wipes the token, so "reactivating" a row would
//     advertise a number that cannot send. Use connect/disconnect instead.
//
// The schema is .strict(), so a request carrying tenantId, businessId or a
// credential is rejected outright rather than silently ignored.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getBusinessScope } from "@/lib/business";
import { prisma } from "@/lib/prisma";
import { PUBLIC_INTEGRATION_SELECT, updateIntegrationMetadata } from "@/lib/whatsappIntegrations";
import { updateWhatsAppIntegrationSchema } from "@/lib/validators/whatsappIntegration";

const MANAGER_ROLES = new Set(["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getBusinessScope();
  if (!scope) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!MANAGER_ROLES.has(scope.role)) {
    return NextResponse.json(
      { success: false, error: "You don't have permission to edit WhatsApp numbers" },
      { status: 403 },
    );
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateWhatsAppIntegrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  try {
    // Ownership is proved inside the helper by the tenantId in its where clause:
    // an id from another workspace is indistinguishable from one that does not exist.
    const result = await updateIntegrationMetadata({
      tenantId: scope.tenantId,
      integrationId: id,
      displayName: parsed.data.displayName,
      makeDefault: parsed.data.isDefault,
    });

    if (!result.ok) {
      return result.reason === "inactive"
        ? NextResponse.json(
            {
              success: false,
              error: "A disconnected number cannot be the default. Reconnect it through Meta first.",
            },
            { status: 409 },
          )
        : NextResponse.json({ success: false, error: "WhatsApp number not found" }, { status: 404 });
    }

    await prisma.auditLog.create({
      data: {
        tenantId: scope.tenantId,
        userId: scope.userId,
        action: "WHATSAPP_INTEGRATION_UPDATED",
        resource: "whatsapp_integration",
        resourceId: result.integration.id,
        // Which fields changed, never their credentials.
        metadata: {
          fields: Object.keys(parsed.data),
        },
      },
    });

    // Re-read through the public projection so no token can reach the response.
    const integration = await prisma.whatsAppIntegration.findUnique({
      where: { id: result.integration.id },
      select: PUBLIC_INTEGRATION_SELECT,
    });

    return NextResponse.json({ success: true, data: integration });
  } catch (error) {
    console.error("[WA INTEGRATION PATCH] Failed", {
      integrationId: id,
      tenantId: scope.tenantId,
      reason: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json(
      { success: false, error: "Could not update the WhatsApp number. Please try again." },
      { status: 500 },
    );
  }
}
