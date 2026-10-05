// ============================================================================
// MODULE : Client activity report (for the client's reseller)
//
// What a reseller may know about a client's use of the product: totals and
// per-campaign delivery numbers. Only counts and sums are ever selected —
// never a contact, a phone number, or the text of a message — so the report
// can't leak the client's customers however the page around it changes.
// ============================================================================

import { MessageDirection, MessageStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const REPORT_PERIODS = [7, 30, 90] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export interface ClientReport {
  days: ReportPeriod;
  messages: {
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    received: number;
  };
  /** Outbound / inbound messages per day, oldest first, for the activity chart. */
  daily: { date: string; sent: number; received: number }[];
  conversations: { started: number; open: number };
  contactsAdded: number;
  campaigns: {
    count: number;
    recent: {
      id: string;
      name: string;
      status: string;
      createdAt: Date;
      total: number;
      sent: number;
      delivered: number;
      read: number;
      failed: number;
    }[];
  };
  /** Wallet debits in the period (paise, positive). */
  spentMinor: number;
}

export function reportPeriod(raw: string | null): ReportPeriod {
  const n = Number(raw);
  return (REPORT_PERIODS as readonly number[]).includes(n) ? (n as ReportPeriod) : 30;
}

export async function getClientReport(tenantId: string, days: ReportPeriod = 30): Promise<ClientReport> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));

  const [byStatus, daily, started, open, contactsAdded, campaignCount, recent, spent] = await Promise.all([
    prisma.message.groupBy({
      by: ["direction", "status"],
      where: { tenantId, isNote: false, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.$queryRaw<{ day: Date; direction: MessageDirection; n: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day, direction, COUNT(*)::bigint AS n
      FROM messages
      WHERE "tenantId" = ${tenantId} AND "isNote" = false AND "createdAt" >= ${since}
      GROUP BY 1, 2
    `,
    prisma.conversation.count({ where: { tenantId, createdAt: { gte: since } } }),
    prisma.conversation.count({ where: { tenantId, status: "OPEN" } }),
    prisma.contact.count({ where: { tenantId, isBlocked: false, createdAt: { gte: since } } }),
    prisma.campaign.count({ where: { tenantId, createdAt: { gte: since } } }),
    prisma.campaign.findMany({
      where: { tenantId, createdAt: { gte: since } },
      select: {
        id: true, name: true, status: true, createdAt: true,
        totalCount: true, sentCount: true, deliveredCount: true, readCount: true, failedCount: true,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.walletTransaction.aggregate({
      where: { tenantId, amountMinor: { lt: 0 }, createdAt: { gte: since } },
      _sum: { amountMinor: true },
    }),
  ]);

  // A message that reached "read" was also delivered and sent, so the funnel counts
  // each status and everything past it.
  const out = (statuses: MessageStatus[]) =>
    byStatus
      .filter((r) => r.direction === "OUTBOUND" && statuses.includes(r.status))
      .reduce((n, r) => n + r._count._all, 0);
  const received = byStatus.filter((r) => r.direction === "INBOUND").reduce((n, r) => n + r._count._all, 0);

  const perDay = new Map<string, { sent: number; received: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setUTCDate(since.getUTCDate() + i);
    perDay.set(d.toISOString().slice(0, 10), { sent: 0, received: 0 });
  }
  for (const row of daily) {
    const bucket = perDay.get(new Date(row.day).toISOString().slice(0, 10));
    if (!bucket) continue;
    if (row.direction === "OUTBOUND") bucket.sent += Number(row.n);
    else bucket.received += Number(row.n);
  }

  return {
    days,
    messages: {
      sent: out(["SENT", "DELIVERED", "READ"]),
      delivered: out(["DELIVERED", "READ"]),
      read: out(["READ"]),
      failed: out(["FAILED"]),
      received,
    },
    daily: [...perDay].map(([date, v]) => ({ date, ...v })),
    conversations: { started, open },
    contactsAdded,
    campaigns: {
      count: campaignCount,
      recent: recent.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        createdAt: c.createdAt,
        total: c.totalCount,
        sent: c.sentCount,
        delivered: c.deliveredCount,
        read: c.readCount,
        failed: c.failedCount,
      })),
    },
    spentMinor: Math.abs(spent._sum.amountMinor ?? 0),
  };
}
