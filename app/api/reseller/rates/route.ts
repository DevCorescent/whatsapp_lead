// ============================================================================
// ROUTE : /api/reseller/rates
//
// GET - The platform's message prices and this reseller's own prices for its
//       clients.
// PUT - Set { category, priceMinor } for its clients (never below the platform
//       price), or priceMinor: null to fall back to the platform price.
//
// Reseller accounts only; reseller.plans.manage.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAccountScope, requireReseller } from "@/lib/accounts";
import { requirePermission } from "@/lib/permissions";
import { RATE_CATEGORIES } from "@/lib/wallet";

const putSchema = z.object({
  category: z.enum(["WA_MARKETING", "WA_UTILITY", "WA_AUTHENTICATION"]),
  priceMinor: z.number().int().min(0).max(100_000).nullable(),
});

async function gate() {
  const scope = await getAccountScope();
  const notReseller = requireReseller(scope);
  if (notReseller) return { error: notReseller };
  const denied = await requirePermission(scope, "reseller.plans.manage");
  if (denied) return { error: denied };
  return { scope: scope! };
}

export async function GET() {
  const { scope, error } = await gate();
  if (error) return error;
  const rows = await prisma.messageRate.findMany({
    where: { OR: [{ resellerId: null }, { resellerId: scope.tenantId }] },
    select: { category: true, resellerId: true, priceMinor: true },
  });
  return NextResponse.json({
    success: true,
    data: RATE_CATEGORIES.map((category) => ({
      category,
      platformMinor: rows.find((r) => r.category === category && !r.resellerId)?.priceMinor ?? null,
      yoursMinor: rows.find((r) => r.category === category && r.resellerId)?.priceMinor ?? null,
    })),
  });
}

export async function PUT(req: NextRequest) {
  const { scope, error } = await gate();
  if (error) return error;
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
  const { category, priceMinor } = parsed.data;

  if (priceMinor === null) {
    await prisma.messageRate.deleteMany({ where: { category, resellerId: scope.tenantId } });
    return NextResponse.json({ success: true });
  }

  const platform = await prisma.messageRate.findFirst({ where: { category, resellerId: null }, select: { priceMinor: true } });
  if (!platform) {
    return NextResponse.json({ success: false, error: "The platform hasn't priced this message type yet" }, { status: 400 });
  }
  if (priceMinor < platform.priceMinor) {
    return NextResponse.json(
      { success: false, error: `Your price can't be below the platform price (${platform.priceMinor} paise)` },
      { status: 400 },
    );
  }
  await prisma.messageRate.upsert({
    where: { category_resellerId: { category, resellerId: scope.tenantId } },
    create: { category, resellerId: scope.tenantId, priceMinor },
    update: { priceMinor },
  });
  return NextResponse.json({ success: true });
}
