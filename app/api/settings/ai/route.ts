import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { aiProviderInfo } from "@/lib/ai";
import { getBusinessScope } from "@/lib/business";

const patchSchema = z.object({
  // TenantSettings fields
  aiEnabled: z.boolean().optional(),
  aiModel: z.string().optional(),
  autoReply: z.boolean().optional(),
  autoReplyDelay: z.number().min(0).max(60).optional(),
  aiPersonality: z.string().optional(),
  // Business-level fields
  aiTemperature: z.number().min(0).max(2).optional(),
  aiMaxTokens: z.number().int().min(1).max(4096).optional(),
  aiSystemPrompt: z.string().optional(),
  aiResponseTone: z.string().optional(),
  offHoursMessage: z.string().optional(),
});

export async function GET() {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, businessId } = scope;

  try {
    const [settings, business] = await Promise.all([
      prisma.tenantSettings.upsert({
        where: { tenantId },
        create: { tenantId },
        update: {},
        select: { aiEnabled: true, aiModel: true, autoReply: true, autoReplyDelay: true, aiPersonality: true },
      }),
      prisma.business.findUnique({
        where: { id: businessId },
        select: { aiTemperature: true, aiMaxTokens: true, aiSystemPrompt: true, aiResponseTone: true, offHoursMessage: true },
      }),
    ]);

    return NextResponse.json({ success: true, data: { ...settings, ...(business ?? {}), ...aiProviderInfo() } });
  } catch (error) {
    console.error("[SETTINGS AI GET]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch AI settings" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, businessId, role } = scope;

  if (!["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"].includes(role)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    const { aiEnabled, aiModel, autoReply, autoReplyDelay, aiPersonality, aiTemperature, aiMaxTokens, aiSystemPrompt, aiResponseTone, offHoursMessage } = parsed.data;

    const tenantData = Object.fromEntries(
      Object.entries({ aiEnabled, aiModel, autoReply, autoReplyDelay, aiPersonality }).filter(([, v]) => v !== undefined)
    );
    const businessData = Object.fromEntries(
      Object.entries({ aiTemperature, aiMaxTokens, aiSystemPrompt, aiResponseTone, offHoursMessage }).filter(([, v]) => v !== undefined)
    );

    const [settings, business] = await Promise.all([
      Object.keys(tenantData).length > 0
        ? prisma.tenantSettings.upsert({ where: { tenantId }, create: { tenantId, ...tenantData }, update: tenantData, select: { aiEnabled: true, aiModel: true, autoReply: true, autoReplyDelay: true, aiPersonality: true } })
        : prisma.tenantSettings.findUnique({ where: { tenantId }, select: { aiEnabled: true, aiModel: true, autoReply: true, autoReplyDelay: true, aiPersonality: true } }),
      Object.keys(businessData).length > 0
        ? prisma.business.update({ where: { id: businessId }, data: businessData, select: { aiTemperature: true, aiMaxTokens: true, aiSystemPrompt: true, aiResponseTone: true, offHoursMessage: true } })
        : prisma.business.findUnique({ where: { id: businessId }, select: { aiTemperature: true, aiMaxTokens: true, aiSystemPrompt: true, aiResponseTone: true, offHoursMessage: true } }),
    ]);

    return NextResponse.json({ success: true, data: { ...(settings ?? {}), ...(business ?? {}) } });
  } catch (error) {
    console.error("[SETTINGS AI PATCH]", error);
    return NextResponse.json({ success: false, error: "Failed to update AI settings" }, { status: 500 });
  }
}
