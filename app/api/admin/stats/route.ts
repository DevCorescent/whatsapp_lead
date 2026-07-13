import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalTenants,
    activeTenants,
    totalUsers,
    totalMessages,
    messagesThisMonth,
    totalLeads,
    wonLeads,
    activeSubscriptions,
    recentTenants,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: { isActive: true } }),
    prisma.user.count(),
    prisma.message.count(),
    prisma.message.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.lead.count(),
    prisma.lead.count({ where: { stage: "WON" } }),
    prisma.subscription.findMany({
      where: { status: { in: ["ACTIVE", "TRIALING"] } },
      include: { plan: { select: { priceMonthly: true, displayName: true } } },
    }),
    prisma.tenant.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const mrr = activeSubscriptions.reduce((sum, sub) => sum + sub.plan.priceMonthly, 0);

  // Group signups by date (YYYY-MM-DD)
  const signupMap: Record<string, number> = {};
  for (const { createdAt } of recentTenants) {
    const date = createdAt.toISOString().split("T")[0];
    signupMap[date] = (signupMap[date] ?? 0) + 1;
  }
  const signupsLast30Days = Object.entries(signupMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  return NextResponse.json({
    success: true,
    data: {
      totalTenants,
      activeTenants,
      totalUsers,
      totalMessages,
      messagesThisMonth,
      totalLeads,
      wonLeads,
      mrr,
      arr: mrr * 12,
      signupsLast30Days,
    },
  });
}
