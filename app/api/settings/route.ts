import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { invalidateCredsCache, invalidateTenantCache } from "@/lib/cache";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  waPhoneNumberId: z.string().optional(),
  waBusinessAccountId: z.string().optional(),
  waApiKey: z.string().optional(),
  waWebhookVerifyToken: z.string().optional(),
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

    // Read before the write. The upsert replaces the number in place, and it is the entry cached
    // under the OLD number that would go on routing inbound messages to this tenant — once the
    // update has happened there is no way to learn what that number was.
    const previous = await prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { waPhoneNumberId: true },
    });

    const settings = await prisma.tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });

    // Only when something the cache actually depends on has moved. `waWebhookVerifyToken` is
    // deliberately absent: it is used during Meta's subscription handshake and appears in neither
    // cached value, so changing it invalidates nothing.
    const whatsappChanged =
      data.waPhoneNumberId !== undefined ||
      data.waApiKey !== undefined ||
      data.waBusinessAccountId !== undefined;

    // Contained as a whole. The invalidation helpers cannot throw, but the lookup below is a
    // database call that can — and by this point the settings have already been saved. Letting it
    // reach the outer catch would answer 500 for a write that succeeded, sending the user to
    // retry a change that already landed. Cache maintenance must not decide the outcome of a
    // completed write, so a failure here is logged and the stale entries are left to their TTL.
    if (whatsappChanged) {
      try {
        // Both numbers, old first — the old entry is the one that can misroute, and the new one
        // may still be cached against whichever workspace held it previously.
        if (previous?.waPhoneNumberId) {
          await invalidateTenantCache(previous.waPhoneNumberId);
        }
        if (settings.waPhoneNumberId && settings.waPhoneNumberId !== previous?.waPhoneNumberId) {
          await invalidateTenantCache(settings.waPhoneNumberId);
        }

        // TenantSettings is the fallback credential source in resolveWhatsAppCreds: any business
        // that has not set its own number or token reads these values. A change here can therefore
        // stale the cached credentials of every business in the tenant, not just one, so all of
        // them are dropped. Businesses with their own credentials are unaffected by the re-resolve.
        const businesses = await prisma.business.findMany({
          where: { tenantId },
          select: { id: true },
        });
        await Promise.all(businesses.map((business) => invalidateCredsCache(business.id)));
      } catch (error) {
        console.error("[SETTINGS PATCH] Cache invalidation failed after a successful save:", error);
      }
    }

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
