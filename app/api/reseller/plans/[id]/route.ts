// ============================================================================
// ROUTE : /api/reseller/plans/[id]
//
// PATCH  - Rename, re-describe, re-price (never below the base) or (de)activate.
// DELETE - Delete a plan no client is on; one in use must be deactivated instead.
//
// Reseller accounts only; reseller.plans.manage; own plans only.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAccountScope, requireReseller } from "@/lib/accounts";
import { requirePermission } from "@/lib/permissions";
import { basePrices } from "@/lib/reseller";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    displayName: z.string().trim().min(1).max(60).optional(),
    description: z.string().trim().max(300).nullable().optional(),
    priceMonthly: z.number().nonnegative().max(10_000_000).optional(),
    priceAnnual: z.number().nonnegative().max(100_000_000).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

async function ownPlan(resellerId: string, id: string) {
  return prisma.plan.findFirst({ where: { id, resellerId } });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const scope = await getAccountScope();
  const notReseller = requireReseller(scope);
  if (notReseller) return notReseller;
  const denied = await requirePermission(scope, "reseller.plans.manage");
  if (denied) return denied;
  const { id } = await params;

  const plan = await ownPlan(scope!.tenantId, id);
  if (!plan) return NextResponse.json({ success: false, error: "Plan not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

  const floor = await basePrices(plan);
  if (parsed.data.priceMonthly !== undefined && parsed.data.priceMonthly < floor.priceMonthly) {
    return NextResponse.json({ success: false, error: `Monthly price can't be below ₹${floor.priceMonthly}` }, { status: 400 });
  }
  if (parsed.data.priceAnnual !== undefined && parsed.data.priceAnnual < floor.priceAnnual) {
    return NextResponse.json({ success: false, error: `Annual price can't be below ₹${floor.priceAnnual}` }, { status: 400 });
  }

  await prisma.plan.update({ where: { id: plan.id }, data: parsed.data });
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const scope = await getAccountScope();
  const notReseller = requireReseller(scope);
  if (notReseller) return notReseller;
  const denied = await requirePermission(scope, "reseller.plans.manage");
  if (denied) return denied;
  const { id } = await params;

  const plan = await ownPlan(scope!.tenantId, id);
  if (!plan) return NextResponse.json({ success: false, error: "Plan not found" }, { status: 404 });

  const inUse = await prisma.subscription.count({ where: { planId: plan.id } });
  if (inUse > 0) {
    return NextResponse.json(
      { success: false, error: `${inUse} client(s) are on this plan — deactivate it instead` },
      { status: 409 },
    );
  }
  await prisma.plan.delete({ where: { id: plan.id } });
  return NextResponse.json({ success: true });
}
