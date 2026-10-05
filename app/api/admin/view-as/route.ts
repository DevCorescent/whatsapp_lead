// ============================================================================
// ROUTE : /api/admin/view-as
//
// POST   { tenantId } - start viewing a client or reseller account as its owner
//                       would (lib/viewAs.ts). Returns where to go.
// DELETE              - stop, back to the admin panel.
//
// SUPER_ADMIN only. Both are written to the audit log on the admin's own account.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VIEW_AS_COOKIE, VIEW_AS_TTL_MS, encodeViewAs } from "@/lib/viewAs";

const bodySchema = z.object({ tenantId: z.string().min(1) });

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

async function superAdmin() {
  const session = await auth();
  if (!session?.user) return { error: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
  if (session.user.role !== "SUPER_ADMIN") {
    return { error: NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }) };
  }
  return { user: session.user, homeTenantId: session.user.viewAs?.homeTenantId ?? session.user.tenantId };
}

export async function POST(req: NextRequest) {
  const { user, homeTenantId, error } = await superAdmin();
  if (error) return error;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Choose an account" }, { status: 400 });

  const tenant = await prisma.tenant.findUnique({
    where: { id: parsed.data.tenantId },
    select: { id: true, slug: true, name: true, isActive: true, accountType: true, resellerType: true, parentId: true },
  });
  if (!tenant) return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 });
  if (tenant.accountType === "PLATFORM" || tenant.id === homeTenantId) {
    return NextResponse.json({ success: false, error: "That's the platform account — use the admin panel" }, { status: 400 });
  }
  // Every page of a suspended account refuses to load, so viewing it would show only errors.
  if (!tenant.isActive) {
    return NextResponse.json({ success: false, error: "This account is suspended. Activate it first to view it." }, { status: 409 });
  }

  const value = encodeViewAs(
    {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      accountType: tenant.accountType,
      resellerType: tenant.resellerType ?? null,
      parentTenantId: tenant.parentId ?? null,
    },
    user!.id,
  );

  await prisma.auditLog.create({
    data: {
      tenantId: homeTenantId!,
      userId: user!.id,
      action: "ADMIN_VIEW_AS_STARTED",
      resource: "tenant",
      resourceId: tenant.id,
      metadata: { tenantName: tenant.name },
    },
  });

  const res = NextResponse.json({
    success: true,
    data: { redirect: tenant.accountType === "RESELLER" ? "/reseller" : "/inbox" },
  });
  res.cookies.set(VIEW_AS_COOKIE, value, { ...cookieOptions, maxAge: Math.floor(VIEW_AS_TTL_MS / 1000) });
  return res;
}

export async function DELETE() {
  const { user, homeTenantId, error } = await superAdmin();
  if (error) return error;

  const viewed = user!.viewAs ? user!.tenantId : null;
  if (viewed) {
    await prisma.auditLog.create({
      data: {
        tenantId: homeTenantId!,
        userId: user!.id,
        action: "ADMIN_VIEW_AS_ENDED",
        resource: "tenant",
        resourceId: viewed,
      },
    });
  }

  const res = NextResponse.json({ success: true, data: { redirect: viewed ? `/tenants/${viewed}` : "/tenants" } });
  res.cookies.set(VIEW_AS_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return res;
}
