// ROUTE: POST /api/onboarding/complete
// Marks the tenant's onboarding as complete so they are not redirected back
// to the wizard on subsequent logins.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";

export async function POST() {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  await prisma.tenantSettings.upsert({
    where: { tenantId: scope.tenantId },
    create: { tenantId: scope.tenantId, onboardingCompleted: true },
    update: { onboardingCompleted: true },
  });

  return NextResponse.json({ success: true });
}
