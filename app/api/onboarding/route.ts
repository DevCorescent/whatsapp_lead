// ============================================================================
// MODULE : Client Onboarding
// ROUTE  : /api/onboarding
//
// GET  - Onboarding state for the current tenant: whether it's finished, plus
//        which setup steps are already satisfied (so the wizard can show ticks).
// POST - Mark onboarding complete (persisted on TenantSettings.onboardingCompleted).
// ============================================================================

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Ensure a settings row exists (a tenant created before this field shipped may lack one). */
async function ensureSettings(tenantId: string) {
  const existing = await prisma.tenantSettings.findUnique({ where: { tenantId } });
  if (existing) return existing;
  return prisma.tenantSettings.create({ data: { tenantId } });
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { tenantId } = session.user;

  try {
    const settings = await ensureSettings(tenantId);

    // Derive step completion from real workspace state so the checklist reflects
    // what the tenant has actually done, not just what they've clicked.
    const [teamCount, knowledgeCount] = await Promise.all([
      prisma.user.count({ where: { tenantId } }),
      prisma.knowledgeDoc.count({ where: { tenantId } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        completed: settings.onboardingCompleted,
        steps: {
          whatsapp: Boolean(settings.waApiKey && settings.waPhoneNumberId),
          team: teamCount > 1, // more than just the owner
          knowledge: knowledgeCount > 0,
        },
      },
    });
  } catch (error) {
    console.error("[ONBOARDING GET]", error);
    return NextResponse.json({ success: false, error: "Failed to load onboarding" }, { status: 500 });
  }
}

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { tenantId } = session.user;

  try {
    await ensureSettings(tenantId);
    await prisma.tenantSettings.update({
      where: { tenantId },
      data: { onboardingCompleted: true },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ONBOARDING POST]", error);
    return NextResponse.json({ success: false, error: "Failed to save onboarding" }, { status: 500 });
  }
}
