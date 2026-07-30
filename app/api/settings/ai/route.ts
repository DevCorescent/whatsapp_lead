// ============================================================================
// ROUTE  : /api/settings/ai
// GET    - The active workspace's AI / auto-reply configuration
// PATCH  - Update it (admin roles only)
//
// Every field here belongs to one WhatsApp account, not to the tenant: a business running a sales
// number and a support number wants the assistant on for one and off for the other, with different
// personas and different models. All of them are therefore columns on `Business` and are read back
// through `resolveAiConfig`, which is the same resolution the inbound pipeline uses — so what this
// screen shows is what the auto-reply path will actually do.
//
// The tenant's legacy `TenantSettings` row is mirrored on write, but only while the active business
// is the tenant's original one. That row is where a deployment predating per-business AI kept these
// flags, and `resolveAiConfig` still ORs it in for that one business; writing to only the business
// would leave the tenant row saying "on" and make switching the assistant off look like it failed.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { aiProviderInfo } from "@/lib/ai";
import { getBusinessScope, isLegacySettingsBusiness, resolveAiConfig } from "@/lib/business";

/**
 * Drop the keys the caller omitted, keeping the type.
 *
 * `undefined` and "absent" are the same thing to Prisma — both mean "leave this column alone" —
 * but they are *not* the same to a `Partial<T>` consumer that counts keys to decide whether there
 * is anything to write, so they are stripped once, here, rather than guarded at each use.
 */
function definedOnly<T extends object>(source: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

const patchSchema = z.object({
  aiEnabled: z.boolean().optional(),
  aiModel: z.string().optional(),
  autoReply: z.boolean().optional(),
  autoReplyDelay: z.number().min(0).max(60).optional(),
  aiPersonality: z.string().optional(),
  aiTemperature: z.number().min(0).max(2).optional(),
  aiMaxTokens: z.number().int().min(1).max(4096).optional(),
  aiSystemPrompt: z.string().optional(),
  aiResponseTone: z.string().optional(),
  offHoursMessage: z.string().optional(),
});

/** The business-only fields — no legacy tenant equivalent exists for these. */
const BUSINESS_ONLY_SELECT = {
  aiTemperature: true,
  aiMaxTokens: true,
  aiSystemPrompt: true,
  aiResponseTone: true,
  offHoursMessage: true,
} as const;

/**
 * The workspace's effective AI configuration, shaped for the client.
 *
 * The five shared fields come from `resolveAiConfig` rather than straight off the row, so the form
 * loads the values the reply path would use. Reading the columns raw would show "off" to a legacy
 * workspace whose flags still live on the tenant row.
 */
async function readAiSettings(businessId: string) {
  const [resolved, business] = await Promise.all([
    resolveAiConfig(businessId),
    prisma.business.findUnique({ where: { id: businessId }, select: BUSINESS_ONLY_SELECT }),
  ]);

  return {
    aiEnabled: resolved?.aiEnabled ?? false,
    autoReply: resolved?.autoReply ?? false,
    autoReplyDelay: resolved?.autoReplyDelay ?? 3,
    aiModel: resolved?.aiModel ?? "",
    aiPersonality: resolved?.aiPersonality ?? null,
    ...(business ?? {}),
  };
}

export async function GET() {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const data = await readAiSettings(scope.businessId);
    return NextResponse.json({
      success: true,
      data: { ...data, workspace: scope.business.name, ...aiProviderInfo() },
    });
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

    // Only the keys the caller actually sent are written.
    const data = definedOnly(parsed.data);

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { success: false, error: "Provide at least one setting to update" },
        { status: 400 },
      );
    }

    await prisma.business.update({ where: { id: businessId }, data });

    // Mirror the five shared flags onto the legacy tenant row, and only for the business that row
    // describes. Without this, `resolveAiConfig`'s OR would keep reporting the tenant's stale
    // "enabled" for that workspace and the switch could never be turned off.
    const shared = definedOnly({
      aiEnabled: data.aiEnabled,
      autoReply: data.autoReply,
      autoReplyDelay: data.autoReplyDelay,
      aiModel: data.aiModel,
      aiPersonality: data.aiPersonality,
    });

    if (Object.keys(shared).length > 0 && (await isLegacySettingsBusiness(tenantId, businessId))) {
      await prisma.tenantSettings.upsert({
        where: { tenantId },
        create: { tenantId, ...shared },
        update: shared,
      });
    }

    return NextResponse.json({ success: true, data: await readAiSettings(businessId) });
  } catch (error) {
    console.error("[SETTINGS AI PATCH]", error);
    return NextResponse.json({ success: false, error: "Failed to update AI settings" }, { status: 500 });
  }
}
