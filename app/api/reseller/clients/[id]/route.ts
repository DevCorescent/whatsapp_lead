// ============================================================================
// ROUTE : /api/reseller/clients/[id]
//
// GET   - One client: account details, plan, usage counts, its commissions.
//         reseller.clients.view; any client the reseller manages or referred.
// PATCH - Suspend / reactivate, change plan (from the reseller's catalogue) or
//         category. reseller.clients.manage; only clients the reseller MANAGES.
//
// Usage is counts only (lib/billing/usage#getUsage) — how many contacts and
// messages, never which ones or what they said.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { findManagedClient, getAccountScope, requireReseller, resellerClientsWhere } from "@/lib/accounts";
import { getUsage } from "@/lib/billing/usage";
import { getWallet } from "@/lib/wallet";
import { requirePermission } from "@/lib/permissions";
import { isAssignablePlan } from "@/lib/reseller";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    isActive: z.boolean().optional(),
    planId: z.string().min(1).optional(),
    categoryId: z.string().min(1).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export async function GET(_req: NextRequest, { params }: Params) {
  const scope = await getAccountScope();
  const notReseller = requireReseller(scope);
  if (notReseller) return notReseller;
  const denied = await requirePermission(scope, "reseller.clients.view");
  if (denied) return denied;
  const resellerId = scope!.tenantId;
  const { id } = await params;

  // Scoped in the query: another reseller's client is indistinguishable from a missing one.
  const client = await prisma.tenant.findFirst({
    where: { id, ...resellerClientsWhere(resellerId) },
    select: {
      id: true,
      name: true,
      isActive: true,
      createdAt: true,
      parentId: true,
      category: { select: { id: true, name: true } },
      subscription: {
        select: {
          status: true, billingCycle: true, currentPeriodStart: true, currentPeriodEnd: true, trialEndsAt: true,
          plan: { select: { id: true, displayName: true, priceMonthly: true } },
        },
      },
      users: {
        select: { name: true, email: true, role: true, isActive: true, lastLoginAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!client) return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });

  try {
    const [usage, commissions, wallet] = await Promise.all([
      getUsage(client.id),
      prisma.resellerCommission.findMany({
        where: { resellerId, clientId: client.id },
        select: { id: true, amountMinor: true, baseMinor: true, rate: true, currency: true, status: true, createdAt: true, paidAt: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      getWallet(client.id),
    ]);
    const { parentId, ...rest } = client;
    return NextResponse.json({
      success: true,
      data: { ...rest, managed: parentId === resellerId, usage, commissions, walletBalanceMinor: wallet.balanceMinor },
    });
  } catch (error) {
    console.error("[RESELLER CLIENT GET]", error);
    return NextResponse.json({ success: false, error: "Failed to load the client" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const scope = await getAccountScope();
  const notReseller = requireReseller(scope);
  if (notReseller) return notReseller;
  const denied = await requirePermission(scope, "reseller.clients.manage");
  if (denied) return denied;
  const resellerId = scope!.tenantId;
  const { id } = await params;

  const client = await findManagedClient(resellerId, id);
  if (!client) return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
  const { isActive, planId, categoryId } = parsed.data;

  if (planId && !(await isAssignablePlan(resellerId, planId))) {
    return NextResponse.json({ success: false, error: "That plan isn't available to your clients" }, { status: 400 });
  }
  if (categoryId) {
    const category = await prisma.businessCategory.findFirst({ where: { id: categoryId, isActive: true }, select: { id: true } });
    if (!category) return NextResponse.json({ success: false, error: "Category not found" }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: client.id },
        data: {
          ...(isActive !== undefined && { isActive }),
          ...(categoryId !== undefined && { categoryId }),
        },
      });
      if (planId) {
        const now = new Date();
        await tx.subscription.upsert({
          where: { tenantId: client.id },
          create: {
            tenantId: client.id,
            planId,
            status: "ACTIVE",
            currentPeriodStart: now,
            currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          },
          // The period is kept: moving plan isn't a payment. Billing settles the difference.
          update: { planId },
        });
      }
      await tx.auditLog.create({
        data: {
          tenantId: resellerId,
          userId: scope!.userId,
          action: "RESELLER_CLIENT_UPDATED",
          resource: "tenant",
          resourceId: client.id,
          metadata: { isActive, planId, categoryId },
        },
      });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[RESELLER CLIENT PATCH]", error);
    return NextResponse.json({ success: false, error: "Failed to update the client" }, { status: 500 });
  }
}
