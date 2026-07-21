import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
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

    const settings = await prisma.tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });

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
