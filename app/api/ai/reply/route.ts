
// ============================================================================
// OWNER  : Gauransh
// MODULE : AI
// ROUTE  : /api/ai/reply
//
// METHODS
// POST   - Draft a reply to a conversation, without sending or storing it
//
// ACCESS
// POST   - Authenticated. Scoped to session.user.tenantId; a conversation owned by
//          another workspace answers 404, exactly as a non-existent one does.
// ============================================================================
//
// This endpoint is a drafting aid, not a send path. It returns a suggestion for an agent to read,
// edit and choose to send — so it deliberately writes nothing: no Message row, no WhatsApp call, no
// Pusher broadcast. The webhook's auto-reply flow is the one that commits and sends; conflating the
// two here would put an unreviewed model output in front of a customer the moment an agent clicked
// "suggest".

import { NextRequest, NextResponse } from "next/server";
import { MessageDirection } from "@prisma/client";

import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateReply } from "@/lib/ai";


/** How much of the thread the model is given as context. Matches the webhook's auto-reply window. */
const AI_HISTORY_LIMIT = 10;

/**
 * The body of a draft request.
 *
 * `strictObject` because the writable surface must be enforced rather than documented: a permissive
 * object would let `tenantId` ride along in the payload, and the day someone reaches for
 * `parsed.data` to build a Prisma `where` is the day that becomes a cross-tenant read.
 *
 * `systemPrompt` is optional and caller-supplied by design — an agent may want to steer a single
 * draft ("reply in Hindi", "be firmer on the price") without changing the workspace's persona. It is
 * never persisted, so the blast radius of a bad prompt is one unsent suggestion.
 */
const generateReplySchema = z.strictObject({
  conversationId: z.string().min(1),
  systemPrompt: z.string().trim().min(1).optional(),
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
 * This is the gate for the entire request. Every message read below is keyed on a conversation that
 * has already been proved ours — there is no path here that touches a message without passing through
 * this check first.
 */
async function resolveConversation(tenantId: string, conversationId: string) {
  return prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
    select: { id: true },
  });
}

/**
 * Load the tail of a conversation as chat turns.
 *
 * Read `createdAt` descending and reversed in memory, because that is the only direction in which
 * "the last ten" can be found rather than scanned: descending is how the schema's
 * `(conversationId, createdAt)` index is walked, so Postgres reads ten rows and stops. Ordering
 * ascending with a `take` would oblige it to walk the thread from the beginning to know which ten are
 * last. The reversal costs ten array slots and gives the model the conversation in the order it
 * happened, which is the order it must reason in.
 *
 * `isNote: false` is a security boundary, not a filter. Internal notes are agents talking to each
 * other *about* a customer; feeding them to a model that drafts a reply *to* that customer is how
 * private commentary ends up quoted back at them.
 *
 * `content: { not: null }` excludes media with no caption — a bare image is a message with nothing to
 * say, and a turn with empty content is noise the model has to spend attention discarding.
 *
 * Scoped by `tenantId` even though the conversation is already proved: defence in depth costs nothing
 * here (the `(tenantId)` index is already in play) and means this helper cannot leak if it is ever
 * called from somewhere that forgot the gate.
 */
async function loadRecentTurns(
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
    orderBy: { createdAt: "desc" },
    take: AI_HISTORY_LIMIT,
    select: { direction: true, content: true },
  });

  return messages.reverse().map(({ direction, content }) => ({
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
 * Decide which persona the model answers as.
 *
 * Precedence is request → workspace → empty, because the three represent narrowing scopes of intent:
 * a prompt sent with this request is the agent steering this one draft, the workspace persona is the
 * business's standing instruction, and an empty string is the model's own default.
 *
 * The workspace column is `aiPersonality`. There is no `aiSystemPrompt` on TenantSettings — the
 * schema names this field for what it holds, and this helper is the one place the two vocabularies
 * meet.
 *
 * `findUnique` is correct and is the one query in this module without an explicit `tenantId` filter:
 * `TenantSettings.tenantId` is itself the unique key, so the lookup *is* the tenant scope.
 */
async function resolveSystemPrompt(
  tenantId: string,
  requested: string | undefined
): Promise<string> {
  if (requested) return requested;

  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: { aiPersonality: true },
  });

  return settings?.aiPersonality?.trim() ?? "";
}

/**
 * Draft a reply for an agent to review.
 *
 * The conversation is proved before the model is called, and the model is called before anything is
 * returned — but nothing is written at any point. That is the whole contract of this route.
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
    const parsed = generateReplySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { conversationId, systemPrompt } = parsed.data;

    const conversation = await resolveConversation(tenantId, conversationId);
    if (!conversation) {
      return NextResponse.json(
        { success: false, error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Independent reads, both already scoped to a proved tenant — no ordering between them, so they
    // are issued together rather than paying two sequential round trips.
    const [turns, prompt] = await Promise.all([
      loadRecentTurns(tenantId, conversation.id),
      resolveSystemPrompt(tenantId, systemPrompt),
    ]);

    // A thread whose only messages are notes or bare media gives the model no turn to answer, and an
    // empty history would have it invent a customer.
    if (turns.length === 0) {
      return NextResponse.json(
        { success: false, error: "Conversation has no messages to reply to" },
        { status: 400 }
      );
    }

    const reply = await generateReply(turns, prompt);

    return NextResponse.json({ success: true, data: { reply: reply.trim() } });
  } catch (error) {
    // Groq's errors embed the request payload and can name the model and key in use; Prisma's name
    // columns and query shapes. Both are logged in full and neither ever reaches the caller.
    console.error("[AI:REPLY]", error);

    return NextResponse.json(
      { success: false, error: "Failed to generate reply" },
      { status: 500 }
    );

  }
}
