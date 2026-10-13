import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";
import { requirePermission } from "@/lib/permissions";
import { generateApiKey } from "@/lib/webhooks";

/** GET — return masked API key (last 4 chars only) */
export async function GET() {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermission(scope, "settings.manage");
  if (denied) return denied;

  const settings = await prisma.tenantSettings.findUnique({ where: { tenantId: scope.tenantId } });
  const key = settings?.apiKey ?? null;
  const masked = key ? "wcrm_••••••••••••••••" + key.slice(-4) : null;

  return NextResponse.json({ success: true, hasKey: !!key, maskedKey: masked });
}

/** POST — generate (or regenerate) an API key */
export async function POST() {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermission(scope, "settings.manage");
  if (denied) return denied;

  const apiKey = generateApiKey();
  await prisma.tenantSettings.upsert({
    where: { tenantId: scope.tenantId },
    update: { apiKey },
    create: { tenantId: scope.tenantId, apiKey },
  });

  return NextResponse.json({ success: true, apiKey });
}

/** DELETE — revoke API key */
export async function DELETE() {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermission(scope, "settings.manage");
  if (denied) return denied;

  await prisma.tenantSettings.updateMany({
    where: { tenantId: scope.tenantId },
    data: { apiKey: null },
  });

  return NextResponse.json({ success: true });
}
