<<<<<<< HEAD
import { NextRequest, NextResponse } from "next/server";
=======
// ============================================================================
// OWNER  : Gauransh
// MODULE : AI
// ROUTE  : /api/ai/qualify
//
// METHODS
// POST   - Score the lead behind a conversation against the BANT framework
//
// ACCESS
// POST   - Authenticated. Scoped to session.user.tenantId; a conversation owned by
//          another workspace answers 404, exactly as a non-existent one does.
// ============================================================================
//
// The one AI route that writes. A qualification is a judgement the sales team acts on — it reorders
// the pipeline and decides who gets called back — so unlike the drafting and summarising endpoints,
// its result belongs on the Lead rather than in a response body that is read once and discarded.
//
// SCHEMA ADAPTATION, stated plainly because it is the most surprising thing in this file:
// `lib/ai.ts:qualifyLead()` returns four BANT booleans, and `Lead` has no columns for them. There is
// no `bantBudget`, `bantAuthority`, `bantNeed` or `bantTimeline`. What Lead *does* have is
// `isDecisionMaker` — a boolean whose meaning is exactly BANT's Authority — so that one is persisted
// against the column that genuinely holds it. The other three are returned to the caller but not
// stored: `budget`, `requirement` and `timeline` on Lead are `String?` columns meant for "₹5,00,000"
// and "end of Q3", and writing "true" into them would corrupt fields the sales team reads. Persisting
// the full BANT breakdown needs four boolean columns the schema does not have, and that is a schema
// decision, not one this route may make.

import { NextRequest, NextResponse } from "next/server";
import { MessageDirection } from "@prisma/client";
>>>>>>> e30b57c (feat(ai): implement qualify, summarize and reply endpoints)
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { qualifyLead } from "@/lib/ai";
<<<<<<< HEAD
import { scoreLabelFor } from "@/lib/utils";

const schema = z.object({
  leadId: z.string().min(1, "leadId is required"),
});
=======
>>>>>>> e30b57c (feat(ai): implement qualify, summarize and reply endpoints)

/** How a transcript line is labelled for the model. Speaker labels, not chat roles. */
const TRANSCRIPT_SPEAKER = {
  CUSTOMER: "Customer",
  AGENT: "Agent",
} as const;

/**
 * The body of a qualification request.
 *
 * `strictObject` because the accepted surface must be enforced rather than documented. In this route
 * it matters more than most: the response carries a `score` and a `scoreLabel`, and a permissive
 * object would invite a client to try supplying them. They are model output written server-side, and
 * accepting either would let a caller mark their own lead QUALIFIED.
 */
const qualifySchema = z.strictObject({
  conversationId: z.string().min(1),
});

/**
 * Resolve a conversation while enforcing tenant isolation, and carry its contact out.
 *
 * `findFirst`, never `findUnique`. `id` is a cuid and unique on its own, so `findUnique({ id })`
 * would happily return another workspace's conversation — uniqueness identifies a row, it does not
 * authorise access to it. Folding `tenantId` into the predicate makes a foreign conversation
 * indistinguishable from one that does not exist, which is the only answer that leaks nothing.
 *
 * `contactId` is selected here rather than fetched later because it is the join this route turns on:
 * a lead is linked to a *contact*, not to a conversation, so the customer behind the thread is the
 * only bridge between the two. Reading it now saves a second query and, more importantly, means the
 * contact we search leads by arrived through the tenant gate rather than from the request.
 */
async function resolveConversation(tenantId: string, conversationId: string) {
  return prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
    select: { id: true, contactId: true },
  });
}

/**
 * Render the conversation as a transcript the model can read.
 *
 * `qualifyLead()` takes prose, not chat turns — it is judging what a customer said about budget and
 * timing, and a flat "Customer: … / Agent: …" transcript is the shape that framing reads best in.
 *
 * Ascending and unbounded: a qualification that saw only the last few messages would confidently
 * score a conversation it had not read. The customer states their budget once, usually early, and a
 * windowed read would miss it and return COLD for a deal that was ready to close.
 *
 * `isNote: false` is a security boundary rather than a filter. Internal notes are agents' private
 * commentary about a customer — an agent's own scepticism about the deal would be fed straight back
 * into the model that scores it, so the qualification would be judging the sales team, not the buyer.
 *
 * `tenantId` rides the query even though the conversation is already proved: the predicate is free on
 * an index already in play, and it means this helper cannot leak if it is ever called from a path
 * that forgot the gate.
 */
async function loadTranscript(
  tenantId: string,
  conversationId: string
): Promise<string> {
  const messages = await prisma.message.findMany({
    where: {
      tenantId,
      conversationId,
      isNote: false,
      content: { not: null },
    },
    orderBy: { createdAt: "asc" },
    select: { direction: true, content: true },
  });

  return messages
    .map(({ direction, content }) => {
      const speaker =
        direction === MessageDirection.INBOUND
          ? TRANSCRIPT_SPEAKER.CUSTOMER
          : TRANSCRIPT_SPEAKER.AGENT;

      return `${speaker}: ${content ?? ""}`;
    })
    .join("\n");
}

/**
 * Find the lead this conversation is about.
 *
 * Leads hang off contacts, not conversations — the schema has no `Lead.conversationId` — so the
 * contact resolved from the thread is the only bridge between them. The `tenantId` predicate is not
 * redundant with it: `contactId` reached us through the tenant gate, but stating the tenant again is
 * what makes this query safe to read on its own terms rather than safe by inheritance.
 *
 * A contact can carry several leads over a relationship. The most recently touched one is the deal
 * the conversation is about — an agent talking to a customer today is not discussing a deal that was
 * closed and forgotten last year.
 */
async function resolveLead(tenantId: string, contactId: string) {
  return prisma.lead.findFirst({
    where: { tenantId, contactId },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
}

/**
 * Write the qualification onto the lead.
 *
 * One row changes, so no transaction: a single `update` is already atomic, and wrapping it would pin
 * a connection to express a guarantee Postgres gives for free.
 *
 * Keyed by `id` alone because ownership was proved by `resolveLead` — re-deriving the tenant here
 * would issue the same read twice, and a lead cannot change tenants between the two statements.
 *
 * `score` and `scoreLabel` are both written from the model's own output. `scoreLabel` is *not*
 * recomputed here: `lib/ai.ts` derives it from the score inside `qualifyLead()`, and re-deriving it
 * in this route would give the same rule two owners, which is how the two drift apart.
 *
 * `isDecisionMaker` is the schema's home for BANT Authority. The other three BANT booleans have no
 * column, and are deliberately not smuggled into the `String?` fields that hold real budget and
 * timeline prose — see the module header.
 */
async function applyQualification(
  leadId: string,
  qualification: {
    score: number;
    scoreLabel: "COLD" | "WARM" | "HOT" | "QUALIFIED";
    bantAuthority: boolean;
  }
) {
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      score: qualification.score,
      scoreLabel: qualification.scoreLabel,
      isDecisionMaker: qualification.bantAuthority,
    },
  });
}

/**
 * Score the lead behind a conversation.
 *
 * Ownership of the conversation is proved, then ownership of the lead, and only then is the model
 * called — the expensive, billable step runs last, after every reason to reject the request has been
 * exhausted. A 404 costs nothing; a 404 discovered after a Groq call costs a Groq call.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
<<<<<<< HEAD
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, id: userId } = session.user;

  try {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    const { leadId } = parsed.data;

    // Get lead + contact + conversation messages
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, tenantId },
      include: {
        contact: {
          select: { id: true, name: true, phone: true },
          include: {
            conversations: {
              where: { tenantId },
              include: {
                messages: {
                  select: { direction: true, content: true, createdAt: true },
                  orderBy: { createdAt: "asc" },
                  take: 50,
                },
              },
              orderBy: { updatedAt: "desc" },
              take: 3,
            },
          },
        },
      },
    });

    if (!lead) return NextResponse.json({ success: false, error: "Lead not found" }, { status: 404 });

    // Build conversation transcript
    const messages: string[] = [];
    for (const conv of lead.contact.conversations) {
      for (const msg of conv.messages) {
        if (!msg.content) continue;
        const role = msg.direction === "INBOUND" ? "Customer" : "Agent";
        messages.push(`${role}: ${msg.content}`);
      }
    }

    if (messages.length === 0) {
      return NextResponse.json({ success: false, error: "No conversation messages to qualify from" }, { status: 400 });
    }

    const result = await qualifyLead(messages.join("\n"));
    const score = Math.min(100, Math.max(0, result.score));
    const scoreLabel = scoreLabelFor(score);

    const updated = await prisma.$transaction(async (tx) => {
      const updatedLead = await tx.lead.update({
        where: { id: leadId },
        data: { score, scoreLabel },
        include: {
          contact: { select: { id: true, name: true } },
        },
      });

      await tx.leadActivity.create({
        data: {
          leadId,
          userId,
          type: "AI_QUALIFICATION",
          content: result.reasoning || `AI scored this lead ${score}/100 (${scoreLabel})`,
          metadata: {
            score,
            scoreLabel,
            bantBudget: result.bantBudget,
            bantAuthority: result.bantAuthority,
            bantNeed: result.bantNeed,
            bantTimeline: result.bantTimeline,
          },
        },
      });

      return updatedLead;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[AI QUALIFY]", error);
    return NextResponse.json({ success: false, error: "AI qualification failed" }, { status: 500 });
=======
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { tenantId } = session.user;

  try {
    const parsed = qualifySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const conversation = await resolveConversation(
      tenantId,
      parsed.data.conversationId
    );
    if (!conversation) {
      return NextResponse.json(
        { success: false, error: "Conversation not found" },
        { status: 404 }
      );
    }

    const lead = await resolveLead(tenantId, conversation.contactId);
    if (!lead) {
      return NextResponse.json(
        { success: false, error: "Lead not found" },
        { status: 404 }
      );
    }

    const transcript = await loadTranscript(tenantId, conversation.id);

    // An empty thread gives the model nothing to judge, and it would return a confident COLD for a
    // conversation it never saw — overwriting a score a human may have set by hand.
    if (transcript.length === 0) {
      return NextResponse.json(
        { success: false, error: "Conversation has no messages to qualify" },
        { status: 400 }
      );
    }

    const qualification = await qualifyLead(transcript);

    await applyQualification(lead.id, qualification);

    return NextResponse.json({
      success: true,
      data: {
        score: qualification.score,
        scoreLabel: qualification.scoreLabel,
        bantBudget: qualification.bantBudget,
        bantAuthority: qualification.bantAuthority,
        bantNeed: qualification.bantNeed,
        bantTimeline: qualification.bantTimeline,
        reasoning: qualification.reasoning,
      },
    });
  } catch (error) {
    // Groq's errors embed the request payload and can name the model and key in use; Prisma's name
    // columns and query shapes. Both are logged in full and neither ever reaches the caller.
    console.error("[AI:QUALIFY]", error);

    return NextResponse.json(
      { success: false, error: "Failed to qualify lead" },
      { status: 500 }
    );
>>>>>>> e30b57c (feat(ai): implement qualify, summarize and reply endpoints)
  }
}
