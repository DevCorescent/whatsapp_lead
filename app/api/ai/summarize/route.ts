// ============================================================================
// OWNER  : Gauransh
// MODULE : AI
// ROUTE  : /api/ai/summarize
//
// METHODS
// POST   - Summarise a conversation for an agent picking it up
//
// ACCESS
// POST   - Authenticated. Scoped to session.user.tenantId; a conversation owned by
//          another workspace answers 404, exactly as a non-existent one does.
// ============================================================================
//
// A read-only endpoint. The summary is generated for the agent looking at the thread right now and is
// deliberately not persisted: a stored summary is stale the moment the customer sends another
// message, and a stale summary is worse than none — an agent trusts it and misses what changed.
// Nothing in this route writes to the database.

import { NextRequest, NextResponse } from "next/server";
import { MessageDirection } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { summarizeConversation } from "@/lib/ai";

/**
 * The body of a summarise request.
 *
 * `strictObject` because the accepted surface must be enforced rather than documented: a permissive
 * object would let `tenantId` ride along in the payload, and the day someone reaches for
 * `parsed.data` to build a Prisma `where` is the day that becomes a cross-tenant read.
 */
const summarizeSchema = z.strictObject({
  conversationId: z.string().min(1),
});

/** The chat turns `lib/ai.ts` reasons over. */
type ChatTurn = { role: "user" | "assistant"; content: string };

/**
 * Resolve a conversation while enforcing tenant isolation.
 *
 * `findFirst`, never `findUnique`. `id` is a cuid and unique on its own, so `findUnique({ id })`
 * would happily return another workspace's conversation — uniqueness identifies a row, it does not
 * authorise access to it. Folding `tenantId` into the predicate makes a foreign conversation
 * indistinguishable from one that does not exist, which is the only answer that leaks nothing: a
 * distinct 403 would confirm the row is real and tell the caller they had found something.
 *
 * This is the gate for the entire request. The transcript read below is keyed on a conversation
 * already proved ours, so no message is touched before ownership is established.
 */
async function resolveConversation(tenantId: string, conversationId: string) {
  return prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
    select: { id: true },
  });
}

/**
 * Load the whole conversation as chat turns, oldest first.
 *
 * Ascending, and unbounded, because a summary that saw only part of the thread would be a confident
 * account of a conversation that did not happen — the failure mode is a plausible wrong answer, which
 * is worse than a slow one. The `(conversationId, createdAt)` index is walked in exactly this
 * direction, so the read is a scan of the thread rather than a sort of it.
 *
 * `isNote: false` is a security boundary, not a filter. Internal notes are agents talking to each
 * other *about* the customer; a summary that quoted them would surface private commentary in a panel
 * an agent may well be screen-sharing with that customer.
 *
 * `content: { not: null }` drops media with no caption — a bare image contributes nothing a language
 * model can summarise, and an empty turn is attention spent on noise.
 *
 * `tenantId` is carried here even though the conversation is already proved. Defence in depth costs
 * nothing (the predicate rides an index already in play) and means this helper cannot leak if it is
 * ever called from a path that forgot the gate.
 */
async function loadTranscript(
  tenantId: string,
  conversationId: string
): Promise<ChatTurn[]> {
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

  return messages.map(({ direction, content }) => ({
    role:
      direction === MessageDirection.INBOUND
        ? ("user" as const)
        : ("assistant" as const),
    // Narrowed by the `content: { not: null }` predicate above; the fallback keeps the map total
    // without a non-null assertion.
    content: content ?? "",
  }));
}

/**
 * Summarise a conversation.
 *
 * Ownership is proved, the transcript is read, the model is called, the summary is returned. Nothing
 * is written at any point — that is the whole contract of this route.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { tenantId } = session.user;

  try {
    const parsed = summarizeSchema.safeParse(await req.json());
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

    const transcript = await loadTranscript(tenantId, conversation.id);

    // An empty thread gives the model nothing to summarise, and it would invent a conversation rather
    // than admit there was none.
    if (transcript.length === 0) {
      return NextResponse.json(
        { success: false, error: "Conversation has no messages to summarize" },
        { status: 400 }
      );
    }

    const summary = await summarizeConversation(transcript);

    return NextResponse.json({
      success: true,
      data: { summary: summary.trim() },
    });
  } catch (error) {
    // Groq's errors embed the request payload and can name the model and key in use; Prisma's name
    // columns and query shapes. Both are logged in full and neither ever reaches the caller.
    console.error("[AI:SUMMARIZE]", error);

    return NextResponse.json(
      { success: false, error: "Failed to summarize conversation" },
      { status: 500 }
    );
  }
}
