// ============================================================================
// OWNER  : Gauransh
// MODULE : AI
// ROUTE  : /api/ai/sentiment
//
// METHODS
// POST   - Classify how a conversation's customer currently feels
//
// ACCESS
// POST   - Authenticated. Scoped to session.user.tenantId; a conversation owned by
//          another workspace answers 404, exactly as a non-existent one does.
// ============================================================================
//
// `detectSentiment` has existed in lib/ai.ts with no caller — this is the route that reaches it.
//
// Read-only, like /api/ai/summarize: the verdict is produced for the agent looking at the thread now
// and is not persisted. Sentiment is a property of the last thing the customer said, so a stored
// value is wrong the moment they say something else, and a stale "negative" badge on a customer who
// has since been sorted out is worse than no badge.

import { NextRequest, NextResponse } from "next/server";
import { MessageDirection } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { detectSentiment } from "@/lib/ai";

/** Matches the sibling AI routes: strict, so nothing can ride along into a Prisma predicate. */
const sentimentSchema = z.strictObject({
  conversationId: z.string().min(1),
});

/**
 * How many of the customer's most recent messages the verdict is based on.
 *
 * Sentiment is about the customer's current state, not the history of the thread: a complaint that
 * was resolved twenty messages ago should not colour how the agent reads the conversation today.
 */
const SENTIMENT_WINDOW = 10;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { tenantId } = session.user;

  try {
    const parsed = sentimentSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // findFirst with tenantId, never findUnique by id alone: a cuid identifies a row, it does not
    // authorise access to it, and a foreign conversation must be indistinguishable from a missing one.
    const conversation = await prisma.conversation.findFirst({
      where: { id: parsed.data.conversationId, tenantId },
      select: { id: true },
    });
    if (!conversation) {
      return NextResponse.json(
        { success: false, error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Inbound only — the question is how the *customer* feels, and folding in the agent's own
    // replies would measure the tone of the workspace answering itself. `isNote: false` keeps
    // internal commentary about the customer out of a verdict about the customer.
    const messages = await prisma.message.findMany({
      where: {
        tenantId,
        conversationId: conversation.id,
        direction: MessageDirection.INBOUND,
        isNote: false,
        content: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: SENTIMENT_WINDOW,
      select: { content: true },
    });

    if (messages.length === 0) {
      return NextResponse.json(
        { success: false, error: "Conversation has no customer messages to analyze" },
        { status: 400 }
      );
    }

    // Read back into chronological order so the model sees the exchange the way it happened.
    const text = messages
      .reverse()
      .map((m) => m.content ?? "")
      .join("\n");

    const sentiment = await detectSentiment(text);

    return NextResponse.json({ success: true, data: { sentiment } });
  } catch (error) {
    // Provider errors embed the request payload and can name the model and key in use. Logged in
    // full, never returned.
    console.error("[AI:SENTIMENT]", error);
    return NextResponse.json(
      { success: false, error: "Failed to analyze sentiment" },
      { status: 500 }
    );
  }
}
