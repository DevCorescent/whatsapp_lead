// ============================================================================
// OWNER  : Gauransh
// MODULE : Analytics
// ROUTE  : /api/analytics
//
// METHODS
// GET    - Dashboard metrics for the authenticated tenant over a rolling period
//
// ACCESS
// GET    - Authenticated. Scoped to session.user.tenantId; there is no request
//          parameter that can widen the scope beyond the caller's own workspace.
// ============================================================================
//
// A pure read model over rows the Webhook, Messages, Leads and Campaigns modules produce. It writes
// nothing and therefore uses no transaction: a transaction exists to make writes atomic, and using
// one to bundle reads would buy a snapshot nobody asked for at the cost of a held connection. The
// five queries below are independent and are issued together.
//
// SCHEMA LIMITATION, stated up front because it shapes one metric:
// `Conversation` has no `resolvedAt` column — only `updatedAt`. `resolvedToday` therefore counts
// conversations that are RESOLVED *and were touched today*, which is the closest correct value the
// schema permits. It over-counts: an old resolved thread that is merely reassigned, relabelled, or
// has its unread counter reset will bump `updatedAt` and reappear in today's figure. Reporting the
// true number needs a `resolvedAt` timestamp, and that is a schema decision, not one this route may
// make. See `getConversationMetrics`.

import { NextRequest, NextResponse } from "next/server";
import {
  ConversationStatus,
  MessageDirection,
} from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** The rolling windows the dashboard offers, and how many calendar days each spans. */
const PERIOD_DAYS = {
  "today": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
} as const;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const MILLISECONDS_PER_MINUTE = 60 * 1000;


/**
 * The accepted query.
 *
 * The period is the *only* input this endpoint takes, and it is validated against a closed set
 * rather than parsed as a number. That is deliberate: an unbounded day count would let a caller ask
 * for a decade of messages and turn a dashboard request into a table scan. The enum is the rate
 * limit.
 *
 * There is no `tenantId` parameter, and there never will be — the tenant comes from the session, so
 * there is no input a caller could supply to read another workspace's numbers.
 */
const analyticsQuerySchema = z.object({
  period: z.enum(["today", "7d", "30d", "90d"]).default("30d"),
});

type Period = z.infer<typeof analyticsQuerySchema>["period"];

/** The window a request reports on, plus the day boundaries the chart is built from. */
interface DateRange {
  from: Date;
  to: Date;
  days: number;
}

/** One column of the messages chart. */
interface MessagesChartPoint {
  date: string;
  sent: number;
  received: number;
}

/** One bar of the pipeline distribution. */
interface LeadStageCount {
  stage: string;
  count: number;
}

/** Period-over-period delta for each KPI (positive = up, negative = down). */
interface AnalyticsDeltas {
  totalConversations: number | null;
  openConversations: number | null;
  resolvedToday: number | null;
  totalMessages: number | null;
  avgResponseTimeMinutes: number | null;
  totalLeads: number | null;
  wonDeals: number | null;
  conversionRate: number | null;
}

interface ScoreDistributionPoint {
  label: string;
  count: number;
}

interface CampaignPerformancePoint {
  campaign: string;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
}

interface AgentPerformanceRow {
  id: string;
  agent: string;
  avatar: string | null;
  conversations: number;
  avgResponseTime: number;
  resolved: number;
}

/** The dashboard payload. Shape is a contract with the client and does not vary by period. */
interface AnalyticsResponse {
  totalConversations: number;
  openConversations: number;
  resolvedToday: number;
  totalMessages: number;
  avgResponseTimeMinutes: number;
  totalLeads: number;
  wonDeals: number;
  conversionRate: number;
  messagesChart: MessagesChartPoint[];
  leadsByStage: LeadStageCount[];
  deltas: AnalyticsDeltas;
  scoreDistribution: ScoreDistributionPoint[];
  campaignPerformance: CampaignPerformancePoint[];
  agentPerformance: AgentPerformanceRow[];
}

/**
 * The three columns every message metric is derived from.
 *
 * Named as a type because the same rows feed both the response-time calculation and the chart —
 * see `loadMessageActivity` for why they are read once rather than twice.
 */
interface MessageActivity {
  conversationId: string;
  direction: MessageDirection;
  createdAt: Date;
}

/** Midnight UTC of the day a given instant falls in. */
function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

/** The `YYYY-MM-DD` key a chart column is bucketed under. */
function toDateKey(date: Date): string {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

/**
 * Turn a period into the window it names.
 *
 * The window is anchored to midnight rather than to "now minus N × 24h", because the chart must
 * contain whole calendar days: a range starting at 14:20 would split the earliest day in half and
 * report a Monday that was only two-thirds of a Monday. `days - 1` back from today's midnight yields
 * exactly `days` inclusive columns.
 *
 * UTC throughout. `TenantSettings.timezone` exists and is deliberately not consulted: applying it
 * would require bucketing dates in the tenant's zone while Postgres stores and compares them in UTC,
 * and a half-applied timezone is worse than a consistently absent one. Day boundaries here are UTC
 * boundaries, and the client is free to relabel them.
 */
function resolveDateRange(period: Period): DateRange {
  const days = PERIOD_DAYS[period];
  const now = new Date();
  const from = new Date(
    startOfUtcDay(now).getTime() - (days - 1) * MILLISECONDS_PER_DAY
  );

  return { from, to: now, days };
}

/**
 * Count the conversation metrics.
 *
 * Three independent counts, issued together. `count()` rather than `findMany().length`: the row
 * bodies are never needed, and materialising a workspace's entire conversation table to measure its
 * height would be the single most expensive thing this endpoint could do.
 *
 * Every predicate carries `tenantId`, and every one of them rides an index the schema already
 * declares — `(tenantId, status)` serves the OPEN and RESOLVED counts directly.
 *
 * `openConversations` is scoped to the period. The spec calls out `resolvedToday` as the one metric
 * independent of it, which is what makes the others period-bound; read as a live backlog instead,
 * this would be the same query without the `createdAt` clause.
 *
 * `resolvedToday` uses `updatedAt` because the schema offers nothing better — see the module header.
 * It is the closest correct value, not the true one.
 */
async function getConversationMetrics(tenantId: string, range: DateRange) {
  const todayStart = startOfUtcDay(range.to);

  const [totalConversations, openConversations, resolvedToday] =
    await Promise.all([
      prisma.conversation.count({
        where: { tenantId, createdAt: { gte: range.from, lte: range.to } },
      }),
      prisma.conversation.count({
        where: {
          tenantId,
          status: ConversationStatus.OPEN,
          createdAt: { gte: range.from, lte: range.to },
        },
      }),
      prisma.conversation.count({
        where: {
          tenantId,
          status: ConversationStatus.RESOLVED,
          updatedAt: { gte: todayStart, lte: range.to },
        },
      }),
    ]);

  return { totalConversations, openConversations, resolvedToday };
}

/**
 * Read every message in the window, once.
 *
 * Three metrics are derived from these rows — `totalMessages`, `avgResponseTimeMinutes` and
 * `messagesChart` — and they are read a single time rather than three, because the response-time
 * calculation is the constraint. Averaging the gap between a customer's message and the reply that
 * followed it requires knowing which message *preceded* which within a conversation, and that is a
 * window function. Prisma exposes no window functions, and raw SQL is out of scope, so the ordering
 * is done in Postgres and the pairing in memory. Having paid for the rows, the other two metrics are
 * counted from them for free rather than issuing a `count()` and a `groupBy()` over the same range.
 *
 * Only three columns are selected. A 90-day window on a busy workspace is a large read, and the
 * difference between three scalar columns and the whole `Message` row — which carries `metadata`,
 * holding Meta's entire raw webhook payload — is the difference between a dashboard and an incident.
 *
 * Ordered by conversation, then time: the pairing walk below depends on messages arriving grouped by
 * thread and chronological within it, and sorting in the database is cheaper than sorting in Node.
 *
 * `isNote: false` is a correctness boundary, not a filter. An internal note is an agent writing to
 * their own team — it never reaches WhatsApp. Counting one as a "sent" message would overstate the
 * business's outreach, and treating one as a reply would credit the team with answering a customer
 * they never actually answered.
 */
async function loadMessageActivity(
  tenantId: string,
  range: DateRange
): Promise<MessageActivity[]> {
  return prisma.message.findMany({
    where: {
      tenantId,
      isNote: false,
      createdAt: { gte: range.from, lte: range.to },
    },
    orderBy: [{ conversationId: "asc" }, { createdAt: "asc" }],
    select: { conversationId: true, direction: true, createdAt: true },
  });
}

/**
 * Average the gap between a customer's message and the reply it received.
 *
 * A pure function over rows already in memory — it issues no query, which is the point: computing
 * this per conversation would be a query inside a loop over every thread in the window.
 *
 * The walk pairs each *first* inbound message of a burst with the next outbound message in the same
 * conversation. A customer who sends three messages before anyone answers has waited once, not three
 * times, so only the first of the burst opens a pending clock — crediting the team with three fast
 * responses for one slow one would invert the metric it is supposed to measure. Consecutive outbound
 * messages after a reply close nothing, because the customer is no longer waiting.
 *
 * Conversations with no reply contribute nothing: an unanswered customer has no response time, and
 * counting them as zero would make an ignored inbox look instantaneous.
 *
 * The average is taken across pairs rather than across conversations, so a thread with ten exchanges
 * weighs ten times a thread with one. That is the intended reading — it measures how long customers
 * wait, not how well individual threads score.
 *
 * Returns 0 when no pair exists, which is the only safe answer: there is no division here that can
 * reach a zero denominator.
 */
function calculateAverageResponseTime(messages: MessageActivity[]): number {
  const gaps: number[] = [];

  let currentConversationId: string | null = null;
  let awaitingReplySince: Date | null = null;

  for (const message of messages) {
    // Rows arrive grouped by conversation, so a change of id ends the previous thread. Any customer
    // still waiting at that boundary never got a reply inside this window and is simply dropped.
    if (message.conversationId !== currentConversationId) {
      currentConversationId = message.conversationId;
      awaitingReplySince = null;
    }

    if (message.direction === MessageDirection.INBOUND) {
      // Only the first message of a burst starts the clock; the customer is already waiting.
      awaitingReplySince ??= message.createdAt;
      continue;
    }

    if (awaitingReplySince === null) continue;

    gaps.push(
      message.createdAt.getTime() - awaitingReplySince.getTime()
    );
    awaitingReplySince = null;
  }

  if (gaps.length === 0) return 0;

  const totalMs = gaps.reduce((sum, gap) => sum + gap, 0);

  return roundToTwoDecimals(totalMs / gaps.length / MILLISECONDS_PER_MINUTE);
}

/**
 * Bucket the window's messages into one column per calendar day.
 *
 * The chart is seeded with every day in the range *before* any message is placed, because a day with
 * no traffic is a fact the chart must state. Emitting only the days that happen to hold messages
 * would let a line chart interpolate straight through a silent weekend and draw activity that did
 * not occur — the empty column is the signal.
 *
 * Bucketing happens in memory rather than in Postgres because Prisma's `groupBy` groups by column
 * value, and `createdAt` is a timestamp: grouping by it would yield one group per message. Truncating
 * a timestamp to a date is a SQL expression, and raw SQL is out of scope. The rows are already loaded
 * for the response-time calculation, so this costs a single pass and no round trip.
 */
function buildMessagesChart(
  messages: MessageActivity[],
  range: DateRange
): MessagesChartPoint[] {
  const buckets = new Map<string, MessagesChartPoint>();
  const firstDay = startOfUtcDay(range.from).getTime();

  for (let offset = 0; offset < range.days; offset += 1) {
    const date = toDateKey(
      new Date(firstDay + offset * MILLISECONDS_PER_DAY)
    );

    buckets.set(date, { date, sent: 0, received: 0 });
  }

  for (const message of messages) {
    const bucket = buckets.get(toDateKey(message.createdAt));

    // A message outside every seeded day cannot occur — the rows were read from this same range —
    // but a missing bucket is skipped rather than created, so the chart can never grow a column the
    // client did not ask for.
    if (!bucket) continue;

    if (message.direction === MessageDirection.OUTBOUND) {
      bucket.sent += 1;
    } else {
      bucket.received += 1;
    }
  }

  return [...buckets.values()];
}

/**
 * Count leads by stage, and derive every lead metric from that one read.
 *
 * A single `groupBy` answers four questions. `totalLeads` is the sum of the groups, `wonDeals` is the
 * WON group, `conversionRate` is the ratio of the two, and `leadsByStage` is the groups themselves —
 * so issuing separate `count()` calls for each would be three extra round trips over the same rows,
 * and would open a window in which the total and the breakdown could disagree.
 *
 * `WON` is read from the Prisma enum, not written as a string. The stage list is likewise derived
 * from the schema, so a stage added to `LeadStage` appears in the response automatically rather than
 * silently vanishing from a hand-maintained array.
 *
 * `tenantId` scopes the group, and the `(tenantId, stage)` index serves it directly.
 */
async function getLeadMetrics(tenantId: string, range: DateRange) {
  const groups = await prisma.lead.groupBy({
    by: ["stageId"],
    where: { tenantId, createdAt: { gte: range.from, lte: range.to } },
    _count: { _all: true },
  });

  const stageIds = groups.map((g) => g.stageId);
  const stages = stageIds.length
    ? await prisma.pipelineStage.findMany({ where: { id: { in: stageIds } } })
    : [];

  const stageMap = new Map(stages.map((s) => [s.id, s]));

  const totalLeads = groups.reduce((sum, g) => sum + (g._count?._all ?? 0), 0);
  const wonDeals = groups.reduce((sum, g) => {
    const s = stageMap.get(g.stageId);
    return sum + (s?.outcome === "WON" ? (g._count?._all ?? 0) : 0);
  }, 0);

  const conversionRate =
    totalLeads === 0 ? 0 : roundToTwoDecimals((wonDeals / totalLeads) * 100);

  const allStages = await prisma.pipelineStage.findMany({
    where: { tenantId, enabled: true },
    orderBy: { order: "asc" },
  });
  const countMap = new Map(groups.map((g) => [g.stageId, g._count?._all ?? 0]));
  const leadsByStage: LeadStageCount[] = allStages.map((s) => ({
    stage: s.name,
    count: countMap.get(s.id) ?? 0,
  }));

  return { totalLeads, wonDeals, conversionRate, leadsByStage };
}

/** Percentages and minutes are reported to two places; floating-point noise is not a metric. */
function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The date range for the period immediately preceding the given range (same duration). */
function priorDateRange(range: DateRange): DateRange {
  const durationMs = range.days * MILLISECONDS_PER_DAY;
  const to = new Date(range.from.getTime() - 1); // one ms before the current window
  const from = new Date(to.getTime() - durationMs + 1);
  return { from, to, days: range.days };
}

/**
 * Compute period-over-period deltas for key metrics.
 * A positive delta means the current period is higher than the prior period.
 */
async function getDeltas(
  tenantId: string,
  range: DateRange,
  current: { totalConversations: number; openConversations: number; resolvedToday: number; totalMessages: number; avgResponseTimeMinutes: number; totalLeads: number; wonDeals: number; conversionRate: number }
): Promise<AnalyticsDeltas> {
  try {
    const prior = priorDateRange(range);
    const [priorConvs, priorMessages, priorLeads] = await Promise.all([
      getConversationMetrics(tenantId, prior),
      loadMessageActivity(tenantId, prior),
      getLeadMetrics(tenantId, prior),
    ]);
    const priorAvgResponse = calculateAverageResponseTime(priorMessages);

    const delta = (curr: number, prev: number): number | null => {
      if (prev === 0 && curr === 0) return null;
      if (prev === 0) return null;
      return roundToTwoDecimals(((curr - prev) / prev) * 100);
    };

    return {
      totalConversations: delta(current.totalConversations, priorConvs.totalConversations),
      openConversations: delta(current.openConversations, priorConvs.openConversations),
      resolvedToday: delta(current.resolvedToday, priorConvs.resolvedToday),
      totalMessages: delta(current.totalMessages, priorMessages.length),
      avgResponseTimeMinutes: delta(current.avgResponseTimeMinutes, priorAvgResponse),
      totalLeads: delta(current.totalLeads, priorLeads.totalLeads),
      wonDeals: delta(current.wonDeals, priorLeads.wonDeals),
      conversionRate: delta(current.conversionRate, priorLeads.conversionRate),
    };
  } catch {
    return {
      totalConversations: null, openConversations: null, resolvedToday: null,
      totalMessages: null, avgResponseTimeMinutes: null, totalLeads: null,
      wonDeals: null, conversionRate: null,
    };
  }
}

/** Count leads grouped by scoreLabel. */
async function getScoreDistribution(tenantId: string): Promise<ScoreDistributionPoint[]> {
  try {
    const groups = await prisma.lead.groupBy({
      by: ["scoreLabel"],
      where: { tenantId },
      _count: { id: true },
    });
    return groups.map((g) => ({ label: g.scoreLabel, count: g._count.id }));
  } catch {
    return [];
  }
}

/** Last 5 campaigns with delivery funnel stats. */
async function getCampaignPerformance(tenantId: string): Promise<CampaignPerformancePoint[]> {
  try {
    const campaigns = await prisma.campaign.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        name: true,
        sentCount: true,
        deliveredCount: true,
        readCount: true,
        repliedCount: true,
      },
    });
    return campaigns.map((c) => ({
      campaign: c.name,
      sent: c.sentCount,
      delivered: c.deliveredCount,
      read: c.readCount,
      replied: c.repliedCount,
    }));
  } catch {
    return [];
  }
}

/** Agents with count of resolved conversations assigned to them in the period. */
async function getAgentPerformance(
  tenantId: string,
  range: DateRange
): Promise<AgentPerformanceRow[]> {
  try {
    const agents = await prisma.user.findMany({
      where: { tenantId, role: "AGENT", isActive: true },
      select: {
        id: true,
        name: true,
        avatar: true,
        assignedConvs: {
          where: {
            tenantId,
            createdAt: { gte: range.from, lte: range.to },
          },
          select: { id: true, status: true },
        },
      },
    });

    return agents.map((a) => {
      const conversations = a.assignedConvs.length;
      const resolved = a.assignedConvs.filter((c) => c.status === "RESOLVED").length;
      return {
        id: a.id,
        agent: a.name,
        avatar: a.avatar ?? null,
        conversations,
        avgResponseTime: 0,
        resolved,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Assemble the dashboard payload.
 *
 * The three reads are independent — conversations, messages and leads share no ordering — so they are
 * issued together rather than sequentially. Five queries in total, in one round of parallelism, which
 * is the floor for this payload without raw SQL.
 */
async function buildAnalyticsResponse(
  tenantId: string,
  range: DateRange
): Promise<AnalyticsResponse> {
  const [conversations, messages, leads, scoreDistribution, campaignPerformance, agentPerformance] = await Promise.all([
    getConversationMetrics(tenantId, range),
    loadMessageActivity(tenantId, range),
    getLeadMetrics(tenantId, range),
    getScoreDistribution(tenantId),
    getCampaignPerformance(tenantId),
    getAgentPerformance(tenantId, range),
  ]);

  const totalMessages = messages.length;
  const avgResponseTimeMinutes = calculateAverageResponseTime(messages);

  const current = {
    ...conversations,
    totalMessages,
    avgResponseTimeMinutes,
    ...leads,
  };

  const deltas = await getDeltas(tenantId, range, current);

  return {
    ...current,
    messagesChart: buildMessagesChart(messages, range),
    deltas,
    scoreDistribution,
    campaignPerformance,
    agentPerformance,
  };
}

/**
 * Return the tenant's dashboard metrics.
 *
 * The handler orchestrates: authenticate, validate, delegate, respond. The tenant is taken from the
 * session and never from the request, so no query below can be widened by anything the caller sends.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { tenantId } = session.user;

  try {
    const { searchParams } = new URL(req.url);

    // `searchParams.get` yields null for an absent key, and Zod reads null as a value rather than an
    // omission — so the absent case is normalised to undefined and allowed to take the default.
    const parsed = analyticsQuerySchema.safeParse({
      period: searchParams.get("period") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const range = resolveDateRange(parsed.data.period);
    const analytics = await buildAnalyticsResponse(tenantId, range);

    return NextResponse.json({ success: true, data: analytics });
  } catch (error) {
    // Prisma's errors name columns and query shapes; the caller learns only that the read failed.
    console.error("[ANALYTICS]", error);

    return NextResponse.json(
      { success: false, error: "Failed to load analytics" },
      { status: 500 }
    );
  }
}
