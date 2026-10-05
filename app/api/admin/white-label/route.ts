// ============================================================================
// ROUTE : /api/admin/white-label   (SUPER_ADMIN only)
//
// GET - The white-label fee settings, and every white-label reseller with its
//       brand, domain, this month's fee status and wallet balance.
// PUT - Change the default monthly fee and the grace period (both dynamic).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { platformRootDomain } from "@/lib/hosts";
import { getPlatformConfig, whiteLabelFeeStatus } from "@/lib/whiteLabelFee";

const putSchema = z.object({
  whiteLabelFeeMinor: z.number().int().min(0).max(100_000_000).optional(),
  whiteLabelGraceDays: z.number().int().min(0).max(90).optional(),
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

  const [config, resellers] = await Promise.all([
    getPlatformConfig(),
    prisma.tenant.findMany({
      where: { accountType: "RESELLER", resellerType: "WHITE_LABEL" },
      select: {
        id: true, name: true, isActive: true,
        whiteLabel: { select: { brandName: true, domain: true, subdomain: true, isActive: true } },
        wallet: { select: { balanceMinor: true } },
        _count: { select: { children: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const rows = await Promise.all(
    resellers.map(async (r) => ({
      id: r.id,
      name: r.name,
      isActive: r.isActive,
      clients: r._count.children,
      brand: r.whiteLabel,
      walletMinor: r.wallet?.balanceMinor ?? 0,
      fee: r.whiteLabel ? await whiteLabelFeeStatus(r.id) : null,
    })),
  );

  return NextResponse.json({
    success: true,
    data: {
      config: { whiteLabelFeeMinor: config.whiteLabelFeeMinor, whiteLabelGraceDays: config.whiteLabelGraceDays },
      rootDomain: platformRootDomain(),
      resellers: rows,
    },
  });
}

export async function PUT(req: NextRequest) {
  const { session, error } = await superAdmin();
  if (error) return error;
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

  await getPlatformConfig();
  const updated = await prisma.platformConfig.update({ where: { id: "platform" }, data: parsed.data });
  await prisma.auditLog.create({
    data: {
      tenantId: (session!.user.viewAs?.homeTenantId ?? session!.user.tenantId),
      userId: session!.user.id,
      action: "WHITE_LABEL_FEE_SETTINGS",
      resource: "platform_config",
      metadata: parsed.data,
    },
  });
  return NextResponse.json({ success: true, data: updated });
}
