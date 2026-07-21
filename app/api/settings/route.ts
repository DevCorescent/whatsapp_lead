// ============================================================================
// MODULE : Workspace Settings
// ROUTE  : /api/settings
//
// GET   - Load every settings section for the current tenant. Secrets are never
//         returned — only booleans indicating whether they are set.
// PATCH - Save one section at a time (general | whatsapp | ai | notifications).
//
// ACCESS
// GET   - Any authenticated member of the tenant.
// PATCH - TENANT_OWNER, ADMIN (or SUPER_ADMIN).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret, hasSecret } from "@/lib/crypto";
import {
  updateSettingsSchema,
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationPrefs,
} from "@/lib/validators/settings";

const EDIT_ROLES = ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"];

/** Public webhook callback URL, from the configured app URL or the request origin. */
function webhookUrl(req: NextRequest): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  return `${base.replace(/\/$/, "")}/api/webhook/whatsapp`;
}

/** Fetch the tenant's settings row, creating an empty one if it has never existed. */
async function ensureSettings(tenantId: string) {
  const existing = await prisma.tenantSettings.findUnique({ where: { tenantId } });
  if (existing) return existing;
  return prisma.tenantSettings.create({ data: { tenantId } });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { tenantId } = session.user;

  try {
    const [tenant, settings] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, slug: true, domain: true },
      }),
      ensureSettings(tenantId),
    ]);

    if (!tenant) {
      return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 });
    }

    const prefs =
      (settings.notificationPrefs as NotificationPrefs | null) ?? DEFAULT_NOTIFICATION_PREFS;

    return NextResponse.json({
      success: true,
      data: {
        general: {
          workspaceName: tenant.name,
          slug: tenant.slug,
          domain: tenant.domain ?? "",
          language: settings.language,
          timezone: settings.timezone,
        },
        whatsapp: {
          phoneNumberId: settings.waPhoneNumberId ?? "",
          businessAccountId: settings.waBusinessAccountId ?? "",
          appId: settings.waAppId ?? "",
          verifyToken: settings.waWebhookVerifyToken ?? "",
          hasApiKey: hasSecret(settings.waApiKey),
          hasAppSecret: hasSecret(settings.waAppSecret),
          webhookUrl: webhookUrl(req),
          connected: hasSecret(settings.waApiKey) && Boolean(settings.waPhoneNumberId),
        },
        ai: {
          aiEnabled: settings.aiEnabled,
          model: settings.aiModel,
          temperature: settings.aiTemperature,
          maxTokens: settings.aiMaxTokens,
          autoReply: settings.autoReply,
          replyDelay: settings.autoReplyDelay,
          offHoursOnly: settings.autoReplyOffHoursOnly,
          responseTone: settings.aiResponseTone ?? "",
          systemPrompt: settings.aiSystemPrompt ?? settings.aiPersonality ?? "",
          timezone: settings.timezone,
          startTime: settings.businessHoursStart,
          endTime: settings.businessHoursEnd,
          businessDays: settings.businessDays,
          offHoursMessage: settings.offHoursMessage ?? "",
        },
        notifications: prefs,
      },
    });
  } catch (error) {
    console.error("[SETTINGS GET]", error);
    return NextResponse.json({ success: false, error: "Failed to load settings" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { tenantId, role } = session.user;

  if (!EDIT_ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  try {
    // Make sure a settings row exists before any nested update targets it.
    await ensureSettings(tenantId);

    if (parsed.data.section === "general") {
      const { workspaceName, slug, domain, language, timezone } = parsed.data.data;

      // Slug and custom domain are workspace-unique; reject a collision before writing.
      const slugTaken = await prisma.tenant.findFirst({
        where: { slug, id: { not: tenantId } },
        select: { id: true },
      });
      if (slugTaken) {
        return NextResponse.json(
          { success: false, error: "That workspace URL is already taken" },
          { status: 409 },
        );
      }

      const normalizedDomain = domain ? domain.trim().toLowerCase() : null;
      if (normalizedDomain) {
        const domainTaken = await prisma.tenant.findFirst({
          where: { domain: normalizedDomain, id: { not: tenantId } },
          select: { id: true },
        });
        if (domainTaken) {
          return NextResponse.json(
            { success: false, error: "That domain is already in use" },
            { status: 409 },
          );
        }
      }

      await prisma.$transaction([
        prisma.tenant.update({
          where: { id: tenantId },
          data: { name: workspaceName, slug, domain: normalizedDomain },
        }),
        prisma.tenantSettings.update({
          where: { tenantId },
          data: { language, timezone },
        }),
      ]);
    } else if (parsed.data.section === "whatsapp") {
      const d = parsed.data.data;
      const data: Prisma.TenantSettingsUpdateInput = {
        waPhoneNumberId: d.phoneNumberId ?? undefined,
        waBusinessAccountId: d.businessAccountId ?? undefined,
        waAppId: d.appId ?? undefined,
        waWebhookVerifyToken: d.verifyToken ?? undefined,
      };
      // Only overwrite a secret when a new, non-empty value was actually supplied,
      // so saving the tab without re-entering the token never clears it.
      if (d.apiKey && d.apiKey.trim()) data.waApiKey = encryptSecret(d.apiKey.trim());
      if (d.appSecret && d.appSecret.trim()) data.waAppSecret = encryptSecret(d.appSecret.trim());

      await prisma.tenantSettings.update({ where: { tenantId }, data });
    } else if (parsed.data.section === "ai") {
      const d = parsed.data.data;
      await prisma.tenantSettings.update({
        where: { tenantId },
        data: {
          aiEnabled: d.aiEnabled,
          aiModel: d.model,
          aiTemperature: d.temperature,
          aiMaxTokens: d.maxTokens,
          autoReply: d.autoReply,
          autoReplyDelay: d.replyDelay,
          autoReplyOffHoursOnly: d.offHoursOnly,
          aiResponseTone: d.responseTone ?? null,
          aiSystemPrompt: d.systemPrompt ?? null,
          timezone: d.timezone,
          businessHoursStart: d.startTime,
          businessHoursEnd: d.endTime,
          businessDays: d.businessDays,
          offHoursMessage: d.offHoursMessage ?? null,
        },
      });
    } else {
      // notifications
      await prisma.tenantSettings.update({
        where: { tenantId },
        data: { notificationPrefs: parsed.data.data as unknown as Prisma.InputJsonObject },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[SETTINGS PATCH]", error);
    return NextResponse.json({ success: false, error: "Failed to save settings" }, { status: 500 });
  }
}
