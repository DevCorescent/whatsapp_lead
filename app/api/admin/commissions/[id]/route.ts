// ============================================================================
// ROUTE : PATCH /api/admin/commissions/[id]   (SUPER_ADMIN only)
//
// Mark a commission PAID (records the payout time), CANCELLED (e.g. the client
// was refunded), or back to PENDING, with an optional note. Audited.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  status: z.enum(["PENDING", "PAID", "CANCELLED"]),
  note: z.string().trim().max(300).optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

  const existing = await prisma.resellerCommission.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!existing) return NextResponse.json({ success: false, error: "Commission not found" }, { status: 404 });

  const updated = await prisma.resellerCommission.update({
    where: { id },
    data: {
      status: parsed.data.status,
      paidAt: parsed.data.status === "PAID" ? new Date() : null,
      ...(parsed.data.note !== undefined && { note: parsed.data.note || null }),
    },
  });
  await prisma.auditLog.create({
    data: {
      tenantId: (session.user.viewAs?.homeTenantId ?? session.user.tenantId),
      userId: session.user.id,
      action: "COMMISSION_STATUS_CHANGED",
      resource: "reseller_commission",
      resourceId: id,
      metadata: { from: existing.status, to: parsed.data.status, note: parsed.data.note ?? null },
    },
  });
  return NextResponse.json({ success: true, data: updated });
}
