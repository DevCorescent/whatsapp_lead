// ============================================================================
// ROUTE : /api/admin/rates   (SUPER_ADMIN only)
//
// GET - Platform WhatsApp message prices per template category (paise per message).
// PUT - Set { category, priceMinor }, or priceMinor: null to remove a price.
//       No price = that category is free.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RATE_CATEGORIES } from "@/lib/wallet";

const putSchema = z.object({
  category: z.enum(["WA_MARKETING", "WA_UTILITY", "WA_AUTHENTICATION"]),
  priceMinor: z.number().int().min(0).max(100_000).nullable(),
});

async function superAdmin() {
  const session = await auth();
  if (!session?.user) return { error: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
  if (session.user.role !== "SUPER_ADMIN") return { error: NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }) };
  return { session };
}

export async function GET() {
  const { error } = await superAdmin();
  if (error) return error;
  const rows = await prisma.messageRate.findMany({ where: { resellerId: null } });
  return NextResponse.json({
    success: true,
    data: RATE_CATEGORIES.map((category) => ({
      category,
      priceMinor: rows.find((r) => r.category === category)?.priceMinor ?? null,
    })),
  });
}

export async function PUT(req: NextRequest) {
  const { session, error } = await superAdmin();
  if (error) return error;
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
  const { category, priceMinor } = parsed.data;

  // Platform rows have resellerId null, which the compound unique can't address — find by hand.
  const existing = await prisma.messageRate.findFirst({ where: { category, resellerId: null }, select: { id: true } });
  if (priceMinor === null) {
    if (existing) await prisma.messageRate.delete({ where: { id: existing.id } });
  } else if (existing) {
    await prisma.messageRate.update({ where: { id: existing.id }, data: { priceMinor } });
  } else {
    await prisma.messageRate.create({ data: { category, priceMinor } });
  }

  await prisma.auditLog.create({
    data: {
      tenantId: (session!.user.viewAs?.homeTenantId ?? session!.user.tenantId),
      userId: session!.user.id,
      action: "RATE_CHANGED",
      resource: "message_rate",
      resourceId: category,
      metadata: { priceMinor },
    },
  });
  return NextResponse.json({ success: true });
}
