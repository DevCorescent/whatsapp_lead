import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  period: z.enum(["today", "7d", "30d", "90d"]).default("30d"),
});

function periodToDate(period: string): Date {
  const d = new Date();
  switch (period) {
    case "today":
      d.setHours(0, 0, 0, 0);
      break;
    case "7d":
      d.setDate(d.getDate() - 7);
      break;
    case "90d":
      d.setDate(d.getDate() - 90);
      break;
    default:
      d.setDate(d.getDate() - 30);
  }
  return d;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  try {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({ period: searchParams.get("period") ?? undefined });
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { period } = parsed.data;
    const since = periodToDate(period);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalConversations,
      openConversations,
      resolvedToday,
      totalMessages,
      totalLeads,
      wonDeals,
      allLeads,
      recentMessages,
      leadsByStageRaw,
      scoreDistributionRaw,
      conversationsByAgent,
      campaignsRaw,
    ] = await Promise.all([
      // All conversations (total)
      prisma.conversation.count({ where: { tenantId } }),
      // Open conversations
      prisma.conversation.count({ where: { tenantId, status: "OPEN" } }),
      // Resolved today
      prisma.conversation.count({ where: { tenantId, status: "RESOLVED", updatedAt: { gte: todayStart } } }),
      // Total messages in period
      prisma.message.count({ where: { tenantId, createdAt: { gte: since } } }),
      // Total leads in period
      prisma.lead.count({ where: { tenantId, createdAt: { gte: since } } }),
      // Won leads — any stage the tenant has marked as a winning outcome
      prisma.lead.count({ where: { tenantId, stage: { outcome: "WON" } } }),
      // All leads for conversion rate
      prisma.lead.count({ where: { tenantId } }),
      // Messages over time (for chart)
      prisma.message.findMany({
        where: { tenantId, createdAt: { gte: since } },
        select: { direction: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      // Pipeline distribution by stage
      prisma.lead.groupBy({
        by: ["stageId"],
        where: { tenantId },
        _count: { stageId: true },
        _sum: { value: true },
      }),
      // Score distribution
      prisma.lead.groupBy({
        by: ["scoreLabel"],
        where: { tenantId },
        _count: { scoreLabel: true },
      }),
      // Agent conversation counts (with resolved)
      prisma.conversation.groupBy({
        by: ["assignedToId"],
        where: { tenantId, assignedToId: { not: null } },
        _count: { id: true },
      }),
      // Campaign performance
      prisma.campaign.findMany({
        where: { tenantId, status: { in: ["COMPLETED", "RUNNING"] } },
        select: {
          id: true,
          name: true,
          sentCount: true,
          deliveredCount: true,
          readCount: true,
          repliedCount: true,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    // Build messages-over-time chart (messagesChart field name)
    const msgsMap = new Map<string, { sent: number; received: number }>();
    for (const msg of recentMessages) {
      const day = msg.createdAt.toISOString().slice(0, 10);
      if (!msgsMap.has(day)) msgsMap.set(day, { sent: 0, received: 0 });
      const entry = msgsMap.get(day)!;
      if (msg.direction === "OUTBOUND") entry.sent++;
      else entry.received++;
    }
    const messagesChart = Array.from(msgsMap.entries()).map(([date, counts]) => ({ date, ...counts }));

    // Pipeline distribution (leadsByStage field name, stageId/count/value). Joined with the
    // tenant's stages so the chart can order the funnel and label each bar dynamically; stages
    // with no leads are included as zero so the funnel shape stays complete.
    const stages = await prisma.pipelineStage.findMany({
      where: { tenantId },
      orderBy: { order: "asc" },
      select: { id: true, name: true },
    });
    const stageCounts = new Map(
      leadsByStageRaw.map((row) => [row.stageId, { count: row._count.stageId, value: row._sum.value ?? 0 }]),
    );
    const leadsByStage = stages.map((s) => ({
      stageId: s.id,
      stage: s.name,
      count: stageCounts.get(s.id)?.count ?? 0,
      value: stageCounts.get(s.id)?.value ?? 0,
    }));

    // Score distribution (label/count)
    const scoreDistribution = scoreDistributionRaw.map((row) => ({
      label: row.scoreLabel,
      count: row._count.scoreLabel,
    }));

    // Resolve agent names + get resolved counts
    const agentIds = conversationsByAgent.map((r) => r.assignedToId).filter(Boolean) as string[];
    const [agentUsers, resolvedByAgent] = await Promise.all([
      agentIds.length > 0
        ? prisma.user.findMany({
            where: { id: { in: agentIds } },
            select: { id: true, name: true, avatar: true },
          })
        : Promise.resolve([] as { id: string; name: string; avatar: string | null }[]),
      agentIds.length > 0
        ? prisma.conversation.groupBy({
            by: ["assignedToId"],
            where: { tenantId, assignedToId: { in: agentIds }, status: "RESOLVED" },
            _count: { id: true },
          })
        : Promise.resolve([] as { assignedToId: string | null; _count: { id: number } }[]),
    ]);

    const agentMap = new Map(agentUsers.map((u) => [u.id, { name: u.name, avatar: u.avatar }]));
    const resolvedMap = new Map(resolvedByAgent.map((r) => [r.assignedToId, r._count.id]));

    const agentPerformance = conversationsByAgent.map((row) => {
      const agent = agentMap.get(row.assignedToId ?? "");
      return {
        id: row.assignedToId ?? undefined,
        agent: agent?.name ?? "Unknown",
        avatar: agent?.avatar ?? null,
        conversations: row._count.id,
        avgResponseTime: null, // Would need message timestamps to compute
        resolved: resolvedMap.get(row.assignedToId) ?? 0,
      };
    });

    // Campaign performance with expected field names
    const campaignPerformance = campaignsRaw.map((c) => ({
      campaign: c.name,
      sent: c.sentCount,
      delivered: c.deliveredCount,
      read: c.readCount,
      replied: c.repliedCount,
    }));

    const conversionRate = allLeads > 0 ? Math.round((wonDeals / allLeads) * 100) : 0;

    // Return shape matching the AnalyticsData interface the UI expects
    return NextResponse.json({
      success: true,
      data: {
        totalConversations,
        openConversations,
        resolvedToday,
        totalMessages,
        totalLeads,
        wonDeals,
        conversionRate,
        avgResponseTimeMinutes: null,
        messagesChart,
        leadsByStage,
        scoreDistribution,
        agentPerformance,
        campaignPerformance,
      },
    });
  } catch (error) {
    console.error("[ANALYTICS]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch analytics" }, { status: 500 });
  }
}
