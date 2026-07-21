import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [
    totalTenants,
    activeTenants,
    totalUsers,
    totalMessages,
    signupsThisMonth,
    signupsLastMonth,
    activeSubscriptions,
    recentTenantsRaw,
    signupDays,
    planBreakdownRaw,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: { isActive: true } }),
    prisma.user.count({ where: { role: { not: "SUPER_ADMIN" } } }),
    prisma.message.count(),
    prisma.tenant.count({ where: { createdAt: { gte: thisMonthStart } } }),
    prisma.tenant.count({ where: { createdAt: { gte: lastMonthStart, lt: thisMonthStart } } }),
    prisma.subscription.findMany({
      where: { status: { in: ["ACTIVE", "TRIALING"] } },
      include: { plan: { select: { priceMonthly: true, displayName: true, name: true } } },
    }),
    prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        subscription: { include: { plan: { select: { displayName: true } } } },
        _count: { select: { users: true } },
      },
    }),
    prisma.tenant.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.subscription.groupBy({
      by: ["planId"],
      where: { status: { in: ["ACTIVE", "TRIALING"] } },
      _count: true,
    }),
  ]);

  const mrr = activeSubscriptions.reduce((s, sub) => s + sub.plan.priceMonthly, 0);

  // churn: (last month signups that cancelled this month) / last month base × 100 — simplified approximation
  const cancelledThisMonth = await prisma.subscription.count({
    where: { status: "CANCELLED", cancelledAt: { gte: thisMonthStart } },
  });
  const churnRate = signupsLastMonth > 0
    ? Math.round((cancelledThisMonth / Math.max(signupsLastMonth, 1)) * 1000) / 10
    : 0;

  // Group signups by date
  const signupMap: Record<string, number> = {};
  for (const { createdAt } of signupDays) {
    const date = createdAt.toISOString().slice(0, 10);
    signupMap[date] = (signupMap[date] ?? 0) + 1;
  }
  const signupsLast30Days = Object.entries(signupMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  // Plan breakdown — resolve plan names
  const planNames: Record<string, string> = {};
  for (const sub of activeSubscriptions) {
    planNames[sub.planId] = sub.plan.displayName;
  }
  const planBreakdown = planBreakdownRaw.map((p) => ({
    planName: planNames[p.planId] ?? p.planId,
    count: p._count,
  }));

  const recentTenants = recentTenantsRaw.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    plan: t.subscription?.plan?.displayName ?? null,
    users: t._count.users,
    createdAt: t.createdAt.toISOString(),
  }));

  return NextResponse.json({
    success: true,
    data: {
      totalTenants,
      activeTenants,
      totalUsers,
      totalMessages,
      mrr,
      arr: mrr * 12,
      signupsThisMonth,
      churnRate,
      signupsLast30Days,
      planBreakdown,
      recentTenants,
    },
  });
}
