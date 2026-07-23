// ============================================================================
// ROUTE  : /api/businesses
// GET    - List every business the signed-in user's tenant owns.
// POST   - Create a new business (workspace) under the tenant.
//
// A user can own several businesses; these endpoints back the business switcher
// and the "Create Business" flow. Billing/team stay tenant-level, so no plan
// limit is enforced on business count here.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getBusinessScope, listBusinesses, publicBusiness, uniqueBusinessSlug } from "@/lib/business";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { createBusinessSchema } from "@/lib/validators/business";

/** Roles allowed to create or modify businesses. Agents can switch but not manage. */
const MANAGER_ROLES = new Set(["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"]);

export async function GET() {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const businesses = await listBusinesses(scope.tenantId);
  return NextResponse.json({
    success: true,
    data: businesses.map(publicBusiness),
    currentBusinessId: scope.businessId,
  });
}

export async function POST(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!MANAGER_ROLES.has(scope.role)) {
    return NextResponse.json({ success: false, error: "You don't have permission to create businesses" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createBusinessSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { name, timezone, logo, whatsappAccessToken, whatsappPhoneNumberId, ...wa } = parsed.data;

  // The Meta phone_number_id is the webhook routing key and is globally unique —
  // reject a number already claimed by any business so inbound routing stays 1:1.
  if (whatsappPhoneNumberId) {
    const taken = await prisma.business.findUnique({
      where: { whatsappPhoneNumberId },
      select: { id: true },
    });
    if (taken) {
      return NextResponse.json(
        { success: false, error: "That WhatsApp phone number ID is already connected to another business" },
        { status: 409 },
      );
    }
  }

  try {
    const slug = await uniqueBusinessSlug(scope.tenantId, name);
    const business = await prisma.business.create({
      data: {
        tenantId: scope.tenantId,
        name,
        slug,
        timezone: timezone || "Asia/Kolkata",
        logo: logo || null,
        whatsappPhoneNumberId: whatsappPhoneNumberId || null,
        whatsappPhoneNumber: wa.whatsappPhoneNumber || null,
        whatsappBusinessId: wa.whatsappBusinessId || null,
        whatsappVerifyToken: wa.whatsappVerifyToken || null,
        // Encrypted at rest, exactly like TenantSettings.waApiKey.
        whatsappAccessToken: whatsappAccessToken ? encryptSecret(whatsappAccessToken) : null,
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: scope.tenantId,
        userId: scope.userId,
        action: "BUSINESS_CREATED",
        resource: "business",
        resourceId: business.id,
      },
    });

    return NextResponse.json({ success: true, data: publicBusiness(business) }, { status: 201 });
  } catch (error) {
    console.error("[BUSINESSES POST]", error);
    return NextResponse.json({ success: false, error: "Failed to create business" }, { status: 500 });
  }
}
