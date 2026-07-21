import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendInviteEmail } from "@/lib/email";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "20"));
  const search = searchParams.get("search") ?? "";
  const isActiveParam = searchParams.get("isActive");
  const planFilter = searchParams.get("planId") ?? "";

  const where = {
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { slug: { contains: search, mode: "insensitive" as const } },
      ],
    }),
    ...(isActiveParam !== null && isActiveParam !== "" && { isActive: isActiveParam === "true" }),
    ...(planFilter && { subscription: { plan: { name: { equals: planFilter.toUpperCase() } } } }),
  };

  const [total, tenants] = await Promise.all([
    prisma.tenant.count({ where }),
    prisma.tenant.findMany({
      where,
      include: {
        _count: { select: { users: true, contacts: true, leads: true } },
        subscription: { include: { plan: { select: { displayName: true, priceMonthly: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  const data = tenants.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    logo: t.logo,
    isActive: t.isActive,
    createdAt: t.createdAt.toISOString(),
    plan: t.subscription?.plan?.displayName ?? null,
    users: t._count.users,
    contacts: t._count.contacts,
    leads: t._count.leads,
  }));

  return NextResponse.json({ success: true, data, pagination: { page, limit, total } });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, slug, ownerEmail, plan: planName, trialDays } = body as {
    name: string;
    slug: string;
    ownerEmail?: string;
    plan?: string;
    trialDays?: number;
  };

  if (!name || !slug) {
    return NextResponse.json({ success: false, error: "name and slug are required" }, { status: 400 });
  }
  if (!ownerEmail) {
    return NextResponse.json({ success: false, error: "ownerEmail is required" }, { status: 400 });
  }

  const existing = await prisma.tenant.findUnique({ where: { slug } });
  if (existing) return NextResponse.json({ success: false, error: "Slug already taken" }, { status: 409 });

  const existingUser = await prisma.user.findFirst({ where: { email: ownerEmail } });
  if (existingUser) return NextResponse.json({ success: false, error: "A user with that email already exists" }, { status: 409 });

  // Resolve plan by name
  let resolvedPlan: { id: string; displayName: string } | null = null;
  if (planName) {
    resolvedPlan = await prisma.plan.findFirst({
      where: { name: planName.toUpperCase() },
      select: { id: true, displayName: true },
    });
  }
  if (!resolvedPlan) {
    resolvedPlan = await prisma.plan.findFirst({
      where: { name: "STARTER" },
      select: { id: true, displayName: true },
    });
  }
  if (!resolvedPlan) {
    return NextResponse.json({ success: false, error: "No plans found in the database — run the seed first" }, { status: 500 });
  }

  const days = Math.max(0, Math.min(90, Number(trialDays ?? 14)));
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const trialEnd = days > 0 ? new Date(now.getTime() + days * 24 * 60 * 60 * 1000) : null;
  const subStatus = days > 0 ? "TRIALING" : "ACTIVE";

  // Generate temp password
  const tempPassword = Math.random().toString(36).slice(-8) + "A1!";
  const hashedPassword = await bcrypt.hash(tempPassword, 10);

  const ownerName = ownerEmail.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const { tenant, user } = await prisma.$transaction(async (tx) => {
    const t = await tx.tenant.create({
      data: { name, slug, settings: { create: {} } },
    });

    await tx.subscription.create({
      data: {
        tenantId: t.id,
        planId: resolvedPlan!.id,
        status: subStatus,
        billingCycle: "MONTHLY",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        ...(trialEnd && { trialEndsAt: trialEnd }),
      },
    });

    const u = await tx.user.create({
      data: {
        tenantId: t.id,
        name: ownerName,
        email: ownerEmail,
        password: hashedPassword,
        role: "ADMIN",
      },
    });

    return { tenant: t, user: u };
  });

  console.log("[admin/tenants] provisioned tenant:", tenant.id, "owner:", user.email, "plan:", resolvedPlan.displayName);

  // Send invite email non-blocking
  const loginUrl = `${process.env.NEXTAUTH_URL ?? "https://whatsapp-lead-five.vercel.app"}/login`;
  sendInviteEmail({
    to: ownerEmail,
    name: ownerName,
    inviterName: "Corescent Admin",
    tenantName: name,
    tempPassword,
    loginUrl,
  }).catch((err) => console.error("[admin/tenants] invite email failed:", err));

  return NextResponse.json({
    success: true,
    data: {
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      user: { id: user.id, email: user.email, name: user.name },
      plan: resolvedPlan.displayName,
      tempPassword,
    },
  }, { status: 201 });
}
