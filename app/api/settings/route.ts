// ============================================================================
// MODULE : Tenant settings
// ROUTE  : /api/settings
//
// METHODS
// GET    - Workspace identity, business hours and mail configuration
// PATCH  - Update the above
//
// ACCESS
// GET    - Authenticated. Scoped to session.user.tenantId.
// PATCH  - Authenticated, admin roles only. Same scoping.
// ============================================================================
//
// This route owns what is genuinely *tenant*-wide: the account's name and domain, the working
// hours the team keeps, and the SMTP relay its notification mail leaves through. One row, one
// tenant.
//
// It deliberately no longer reads or writes the WhatsApp credentials. Those are per-workspace —
// a tenant runs several WhatsApp accounts, each with its own phone number id, business account id
// and token — and keeping them here is what made saving them in one workspace change every other
// one, and what routed inbound messages to whichever business happened to be the tenant's oldest.
// They live on `Business` and are edited through /api/businesses/[id]; `resolveWhatsAppCreds`
// still consults the legacy columns on this row, but only for the tenant's original business.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Secrets and per-workspace credentials are never returned; both are read elsewhere. */
const SETTINGS_SELECT = {
  id: true,
  tenantId: true,
  timezone: true,
  businessHoursStart: true,
  businessHoursEnd: true,
  businessDays: true,
  offHoursMessage: true,
  smtpHost: true,
  smtpPort: true,
  smtpUser: true,
  smtpFrom: true,
  createdAt: true,
  updatedAt: true,
} as const;

const patchSchema = z.object({
  timezone: z.string().optional(),
  businessHoursStart: z.string().optional(),
  businessHoursEnd: z.string().optional(),
  businessDays: z.array(z.number()).optional(),
  offHoursMessage: z.string().optional(),
  smtpHost: z.string().optional(),
  smtpPort: z.number().optional(),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
  smtpFrom: z.string().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  try {
    const settings = await prisma.tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId },
      update: {},
      select: SETTINGS_SELECT,
    });

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, slug: true, logo: true, domain: true },
    });

    return NextResponse.json({ success: true, data: { ...settings, tenant } });
  } catch (error) {
    console.error("[SETTINGS GET]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, role } = session.user;

  if (!["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"].includes(role)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    const data = parsed.data;

    const settings = await prisma.tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
      select: SETTINGS_SELECT,
    });

    // No cache invalidation here any more, and none is owed: nothing this route writes takes part
    // in the routing or credentials caches. Those keys are dropped by /api/businesses/[id], which
    // is now the only writer of the values they hold.

    // Also allow updating tenant name/logo via same endpoint
    const tenantBody = body as Record<string, unknown>;
    if (tenantBody.tenantName || tenantBody.logo) {
      const tenantData: { name?: string; logo?: string } = {};
      if (tenantBody.tenantName) tenantData.name = String(tenantBody.tenantName);
      if (tenantBody.logo) tenantData.logo = String(tenantBody.logo);
      await prisma.tenant.update({ where: { id: tenantId }, data: tenantData });
    }

    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    console.error("[SETTINGS PATCH]", error);
    return NextResponse.json({ success: false, error: "Failed to update settings" }, { status: 500 });
  }
}
