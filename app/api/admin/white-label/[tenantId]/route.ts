// ============================================================================
// ROUTE : PATCH /api/admin/white-label/[tenantId]   (SUPER_ADMIN only)
//
// One white-label reseller:
//   { feeOverrideMinor: number | null }  — its own monthly fee, or back to default;
//   { action: "charge" }                 — take this month's fee now;
//   { action: "suspend", reason? }       — pause its branding;
//   { action: "reactivate" }             — lift a suspension (e.g. fee waived).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateBrandCache } from "@/lib/branding";
import { chargeWhiteLabelFee } from "@/lib/whiteLabelFee";

type Params = { params: Promise<{ tenantId: string }> };

const schema = z.object({
  feeOverrideMinor: z.number().int().min(0).max(100_000_000).nullable().optional(),
  action: z.enum(["charge", "suspend", "reactivate"]).optional(),
  reason: z.string().trim().max(200).optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  const { tenantId } = await params;

  const config = await prisma.whiteLabelConfig.findUnique({ where: { tenantId }, select: { id: true } });
  if (!config) return NextResponse.json({ success: false, error: "This reseller hasn't set up branding yet" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
  const { feeOverrideMinor, action, reason } = parsed.data;

  if (feeOverrideMinor !== undefined) {
    await prisma.whiteLabelConfig.update({ where: { tenantId }, data: { feeOverrideMinor } });
  }

  let outcome: unknown = null;
  if (action === "charge") outcome = await chargeWhiteLabelFee(tenantId);
  if (action === "suspend") {
    await prisma.whiteLabelConfig.update({
      where: { tenantId },
      data: { suspendedAt: new Date(), suspendedReason: reason || "Suspended by the platform" },
    });
    invalidateBrandCache();
  }
  if (action === "reactivate") {
    await prisma.whiteLabelConfig.update({
      where: { tenantId },
      data: { suspendedAt: null, suspendedReason: null, feeDueSince: null },
    });
    invalidateBrandCache();
  }

  await prisma.auditLog.create({
    data: {
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "WHITE_LABEL_ADMIN",
      resource: "white_label",
      resourceId: tenantId,
      metadata: { feeOverrideMinor: feeOverrideMinor ?? undefined, action: action ?? null, reason: reason ?? null },
    },
  });
  return NextResponse.json({ success: true, data: { outcome } });
}
