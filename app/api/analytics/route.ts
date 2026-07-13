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
  LeadStage,
  MessageDirection,
} from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** The rolling windows the dashboard offers, and how many calendar days each spans. */
const PERIOD_DAYS = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
} as const;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const MILLISECONDS_PER_MINUTE = 60 * 1000;

/** Every stage of the pipeline, derived from the schema so a new stage cannot go missing. */
const LEAD_STAGES = Object.values(LeadStage);

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
  period: z.enum(["7d", "30d", "90d"]).default("30d"),
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
    by: ["stage"],
    where: { tenantId, createdAt: { gte: range.from, lte: range.to } },
    _count: { _all: true },
  });

  const counts = new Map<LeadStage, number>(
    groups.map((group) => [group.stage, group._count._all])
  );

  const totalLeads = groups.reduce(
    (sum, group) => sum + group._count._all,
    0
  );
  const wonDeals = counts.get(LeadStage.WON) ?? 0;

  // A workspace with no leads has not failed to convert anything — it has nothing to convert. Zero
  // is the only defensible answer, and it is what keeps this expression away from a NaN.
  const conversionRate =
    totalLeads === 0 ? 0 : roundToTwoDecimals((wonDeals / totalLeads) * 100);

  // Every stage is emitted, empty or not: a pipeline chart with a missing column reads as a stage
  // that does not exist rather than a stage nobody is in.
  const leadsByStage: LeadStageCount[] = LEAD_STAGES.map((stage) => ({
    stage,
    count: counts.get(stage) ?? 0,
  }));

  return { totalLeads, wonDeals, conversionRate, leadsByStage };
}

/** Percentages and minutes are reported to two places; floating-point noise is not a metric. */
function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
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
  const [conversations, messages, leads] = await Promise.all([
    getConversationMetrics(tenantId, range),
    loadMessageActivity(tenantId, range),
    getLeadMetrics(tenantId, range),
  ]);

  return {
    ...conversations,
    // Counted from rows already in hand rather than a sixth `count()` over the same predicate.
    totalMessages: messages.length,
    avgResponseTimeMinutes: calculateAverageResponseTime(messages),
    ...leads,
    messagesChart: buildMessagesChart(messages, range),
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
