import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicTenantSettings } from "@/lib/publicSettings";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      subscription: { include: { plan: { include: { ownerTenant: { select: { id: true, name: true } } } } } },
      settings: true,
      _count: { select: { users: true, contacts: true, leads: true, conversations: true } },
    },
  });

  if (!tenant) return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 });

  // `settings: true` includes the tenant's WhatsApp access token, WhatsApp App Secret,
  // webhook verify token and SMTP password. The admin screen only reads them to render
  // "Yes / Not set", so it is served the same allowlisted projection as /api/settings.
  // Being SUPER_ADMIN is a reason to see that a credential exists, not to be handed a
  // token that can send as that customer.
  const { settings, ...rest } = tenant;

  return NextResponse.json({
    success: true,
    data: {
      ...rest,
      settings: settings ? publicTenantSettings(settings, null) : null,
    },
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { isActive, name, planId } = body as { isActive?: boolean; name?: string; planId?: string };

  // Plan changes moved to PUT ./subscription. They were only ever half-done here
  // — the upsert hardcoded ACTIVE and a thirty-day window, so assigning a plan
  // through this route silently overwrote a negotiated period end and could not
  // express a trial or an annual cycle at all. Refused loudly rather than
  // quietly ignored, so a caller still sending planId finds out.
  if (planId !== undefined) {
    return NextResponse.json(
      { success: false, error: "Use PUT /api/admin/tenants/[id]/subscription to change the plan." },
      { status: 400 },
    );
  }

  const updated = await prisma.tenant.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  return NextResponse.json({ success: true, data: updated });
}
