// ============================================================================
// ROUTE : GET /api/reseller/overview
//
// The reseller dashboard: its account, client counts, commission totals and its
// referral link. Reseller accounts only (reseller.clients.view). Counts and
// money only — never any client's contacts or messages.
// ============================================================================

import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getAccountScope, requireReseller, resellerClientsWhere } from "@/lib/accounts";
import { getBrandForTenant } from "@/lib/branding";
import { permissionsFor, requirePermission } from "@/lib/permissions";

async function referralCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { inviteCode: true } });
  if (user?.inviteCode) return user.inviteCode;
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (let i = 0; i < 20; i++) {
    const code = Array.from(randomBytes(8), (b) => chars[b % chars.length]).join("");
    if (!(await prisma.user.findUnique({ where: { inviteCode: code }, select: { id: true } }))) {
      await prisma.user.update({ where: { id: userId }, data: { inviteCode: code } });
      return code;
    }
  }
  throw new Error("Could not generate a referral code");
}

export async function GET() {
  const scope = await getAccountScope();
  const notReseller = requireReseller(scope);
  if (notReseller) return notReseller;
  const denied = await requirePermission(scope, "reseller.clients.view");
  if (denied) return denied;
  const { tenantId, userId } = scope!;

  try {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const where = resellerClientsWhere(tenantId);
    const [account, total, active, trialing, pending, paid, thisMonth, code, brand, permissions] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, resellerType: true, commissionRate: true, createdAt: true },
      }),
      prisma.tenant.count({ where }),
      prisma.tenant.count({ where: { ...where, isActive: true } }),
      prisma.tenant.count({ where: { ...where, subscription: { status: "TRIALING" } } }),
      prisma.resellerCommission.aggregate({ where: { resellerId: tenantId, status: "PENDING" }, _sum: { amountMinor: true } }),
      prisma.resellerCommission.aggregate({ where: { resellerId: tenantId, status: "PAID" }, _sum: { amountMinor: true } }),
      prisma.resellerCommission.aggregate({
        where: { resellerId: tenantId, status: { not: "CANCELLED" }, createdAt: { gte: monthStart } },
        _sum: { amountMinor: true },
      }),
      referralCode(userId),
      getBrandForTenant(tenantId),
      permissionsFor(scope),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        account,
        clients: { total, active, trialing },
        commission: {
          pendingMinor: pending._sum.amountMinor ?? 0,
          paidMinor: paid._sum.amountMinor ?? 0,
          thisMonthMinor: thisMonth._sum.amountMinor ?? 0,
        },
        referral: { code, link: `${brand.baseUrl}/register?ref=${code}` },
        permissions,
      },
    });
  } catch (error) {
    console.error("[RESELLER OVERVIEW]", error);
    return NextResponse.json({ success: false, error: "Failed to load overview" }, { status: 500 });
  }
}
