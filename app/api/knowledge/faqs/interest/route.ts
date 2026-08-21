// ============================================================================
// MODULE : What customers are actually asking
// ROUTE  : GET /api/knowledge/faqs/interest
//
// ACCESS : Signed-in members of the tenant, scoped to the active business.
// ============================================================================
//
// Aggregates FAQ taps into the two questions worth answering: which questions do
// customers pick, and how many different people picked each one.
//
// Both numbers, not just the count. One contact tapping the same question eight
// times while stuck is a support problem; eight contacts tapping it once is a
// pricing page that does not say enough — and a raw tap count cannot tell those
// apart.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";
import { FAQ_INTENT_POINTS, readFaqIntent } from "@/lib/knowledgeFaq";

/** Windows the panel offers. Days, because that is how the question is asked. */
const WINDOWS: Record<string, number> = { "7": 7, "30": 30, "90": 90 };

export async function GET(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, businessId } = scope;

  try {
    const raw = new URL(req.url).searchParams.get("days") ?? "30";
    const days = WINDOWS[raw] ?? 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await prisma.faqInteraction.findMany({
      where: { tenantId, businessId, createdAt: { gte: since } },
      select: { question: true, intent: true, contactId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      // Bounded so a busy month cannot pull an unbounded set into memory to
      // group it. Newest first, so the cut falls on the least relevant end.
      take: 5_000,
    });

    // Grouped in memory rather than by SQL: the key is the question text, which
    // is not indexed and would need a raw query to group on, for a set this
    // small. Revisit if a workspace ever exceeds the cap above.
    const byQuestion = new Map<
      string,
      { question: string; intent: string; taps: number; contacts: Set<string>; lastAsked: Date }
    >();

    for (const row of rows) {
      const existing = byQuestion.get(row.question);
      if (existing) {
        existing.taps += 1;
        existing.contacts.add(row.contactId);
        // Rows arrive newest first, so the first one seen is the latest.
      } else {
        byQuestion.set(row.question, {
          question: row.question,
          intent: row.intent,
          taps: 1,
          contacts: new Set([row.contactId]),
          lastAsked: row.createdAt,
        });
      }
    }

    const questions = [...byQuestion.values()]
      .map((q) => ({
        question: q.question,
        intent: readFaqIntent(q.intent),
        taps: q.taps,
        contacts: q.contacts.size,
        lastAsked: q.lastAsked,
      }))
      // By distinct people first: how many different customers needed this is a
      // better signal than how many taps it collected.
      .sort((a, b) => b.contacts - a.contacts || b.taps - a.taps)
      .slice(0, 25);

    const uniqueContacts = new Set(rows.map((r) => r.contactId)).size;
    const buyingSignals = rows.filter((r) => FAQ_INTENT_POINTS[readFaqIntent(r.intent)] > 0).length;

    return NextResponse.json({
      success: true,
      data: { days, totalTaps: rows.length, uniqueContacts, buyingSignals, questions },
    });
  } catch (error) {
    console.error("[FAQ INTEREST]", error);
    return NextResponse.json({ success: false, error: "Failed to load FAQ interest" }, { status: 500 });
  }
}
