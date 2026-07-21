import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") ?? "12m";
    const months = range === "3m" ? 3 : range === "6m" ? 6 : 12;

    // Active subscriptions with plan prices
    const activeSubs = await prisma.subscription.findMany({
      where: { status: { in: ["ACTIVE", "TRIALING"] } },
      include: {
        plan: { select: { priceMonthly: true, displayName: true, name: true } },
        tenant: { select: { name: true } },
      },
    });

    const mrr = activeSubs.reduce((s, sub) => s + (sub.plan?.priceMonthly ?? 0), 0);
    const arr = mrr * 12;
    const arpu = activeSubs.length > 0 ? Math.round(mrr / activeSubs.length) : 0;
    const ltv = arpu * 24;

    // Build monthly MRR trend using subscription createdAt dates
    const allSubs = await prisma.subscription.findMany({
      include: { plan: { select: { priceMonthly: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });

    const now = new Date();
    const monthLabels = Array.from({ length: months }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
      return d.toLocaleString("en-IN", { month: "short", year: "2-digit" });
    });

    const monthDates = Array.from({ length: months }, (_, i) => {
      return new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    });

    // For each month, sum plan prices for subscriptions active at that point
    const trend = monthDates.map((monthStart, i) => {
      const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
      const activeThen = allSubs.filter(
        (s) => s.createdAt <= monthEnd && (s.cancelledAt === null || s.cancelledAt > monthStart)
      );
      return {
        month: monthLabels[i],
        mrr: activeThen.reduce((sum, s) => sum + (s.plan?.priceMonthly ?? 0), 0),
      };
    });

    const PLAN_KEYS: Record<string, "starter" | "growth" | "enterprise"> = {
      STARTER: "starter",
      GROWTH: "growth",
      ENTERPRISE: "enterprise",
    };

    const byPlan = monthDates.map((monthStart, i) => {
      const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
      const activeThen = allSubs.filter(
        (s) => s.createdAt <= monthEnd && (s.cancelledAt === null || s.cancelledAt > monthStart)
      );
      const breakdown = { starter: 0, growth: 0, enterprise: 0 };
      for (const s of activeThen) {
        const key = PLAN_KEYS[s.plan?.name ?? ""] ?? null;
        if (key) breakdown[key] += s.plan?.priceMonthly ?? 0;
      }
      return { month: monthLabels[i], ...breakdown };
    });

    return NextResponse.json({
      success: true,
      data: {
        mrr,
        arr,
        arpu,
        ltv,
        trend,
        byPlan,
        transactions: [],
        failed: [],
      },
    });
  } catch (err) {
    console.error("[admin/revenue] ERROR:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
