// ============================================================================
// ROUTE : /api/reseller/clients
//
// GET  - The reseller's clients (managed or referred): account, plan, status and
//        usage counts. reseller.clients.view.
// POST - Create a client account under this reseller, with an owner login and a
//        plan from the reseller's catalogue. reseller.clients.manage.
//
// Reseller accounts only. Returns account and usage data — never a client's
// contacts, chats or message content.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAccountScope, requireReseller, resellerClientsWhere } from "@/lib/accounts";
import { getBrandForTenant } from "@/lib/branding";
import { sendInviteEmail } from "@/lib/email";
import { requirePermission } from "@/lib/permissions";
import { provisionAccount, ProvisioningError } from "@/lib/provisioning";
import { isAssignablePlan } from "@/lib/reseller";

const createSchema = z.object({
  name: z.string().trim().min(1, "Business name is required").max(120),
  ownerName: z.string().trim().max(120).optional(),
  ownerEmail: z.string().trim().email("Enter a valid email"),
  planId: z.string().min(1, "Choose a plan"),
  trialDays: z.number().int().min(0).max(90).default(14),
  categoryId: z.string().min(1).nullable().optional(),
});

export async function GET(req: NextRequest) {
  const scope = await getAccountScope();
  const notReseller = requireReseller(scope);
  if (notReseller) return notReseller;
  const denied = await requirePermission(scope, "reseller.clients.view");
  if (denied) return denied;
  const resellerId = scope!.tenantId;

  const { searchParams } = new URL(req.url);
  const search = (searchParams.get("search") ?? "").trim();
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "25") || 25));

  const where = {
    ...resellerClientsWhere(resellerId),
    ...(search && { name: { contains: search, mode: "insensitive" as const } }),
  };

  try {
    const [total, rows] = await Promise.all([
      prisma.tenant.count({ where }),
      prisma.tenant.findMany({
        where,
        select: {
          id: true,
          name: true,
          isActive: true,
          createdAt: true,
          parentId: true,
          category: { select: { name: true } },
          subscription: {
            select: { status: true, currentPeriodEnd: true, plan: { select: { id: true, displayName: true } } },
          },
          users: {
            where: { role: "TENANT_OWNER" },
            select: { name: true, email: true, lastLoginAt: true },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
          _count: { select: { users: true, contacts: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const earned = rows.length
      ? await prisma.resellerCommission.groupBy({
          by: ["clientId"],
          where: { resellerId, clientId: { in: rows.map((r) => r.id) }, status: { not: "CANCELLED" } },
          _sum: { amountMinor: true },
        })
      : [];
    const earnedBy = new Map(earned.map((e) => [e.clientId, e._sum.amountMinor ?? 0]));

    return NextResponse.json({
      success: true,
      data: rows.map(({ users, _count, parentId, ...r }) => ({
        ...r,
        owner: users[0] ?? null,
        counts: _count,
        // Referred-only clients (moved under someone else) stay visible for commission.
        managed: parentId === resellerId,
        commissionMinor: earnedBy.get(r.id) ?? 0,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("[RESELLER CLIENTS GET]", error);
    return NextResponse.json({ success: false, error: "Failed to load clients" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const scope = await getAccountScope();
  const notReseller = requireReseller(scope);
  if (notReseller) return notReseller;
  const denied = await requirePermission(scope, "reseller.clients.manage");
  if (denied) return denied;
  const resellerId = scope!.tenantId;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
  }
  const input = parsed.data;

  if (!(await isAssignablePlan(resellerId, input.planId))) {
    return NextResponse.json({ success: false, error: "That plan isn't available to your clients" }, { status: 400 });
  }

  try {
    const { tenant, user, tempPassword } = await provisionAccount({
      name: input.name,
      ownerName: input.ownerName,
      ownerEmail: input.ownerEmail,
      accountType: "CLIENT",
      resellerId,
      planId: input.planId,
      trialDays: input.trialDays,
      categoryId: input.categoryId ?? null,
    });

    await prisma.auditLog.create({
      data: {
        tenantId: resellerId,
        userId: scope!.userId,
        action: "RESELLER_CLIENT_CREATED",
        resource: "tenant",
        resourceId: tenant.id,
        metadata: { name: tenant.name, planId: input.planId },
      },
    });

    // The client's owner hears from — and logs in on — the reseller's brand.
    const brand = await getBrandForTenant(resellerId);
    let emailSent = false;
    try {
      await sendInviteEmail({
        to: user.email,
        name: user.name,
        inviterName: scope!.tenantName,
        tenantName: tenant.name,
        tempPassword,
        loginUrl: `${brand.baseUrl}/login`,
        brand: { name: brand.name, color: brand.primaryColor, replyTo: brand.supportEmail },
      });
      emailSent = true;
    } catch (err) {
      console.error("[RESELLER CLIENTS] invite email failed", err);
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          client: { id: tenant.id, name: tenant.name },
          owner: { email: user.email, name: user.name },
          // Shown once so the reseller can pass it on if the email didn't arrive.
          tempPassword,
          emailSent,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ProvisioningError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("[RESELLER CLIENTS POST]", error);
    return NextResponse.json({ success: false, error: "Failed to create the client" }, { status: 500 });
  }
}
