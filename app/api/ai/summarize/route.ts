import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { summarizeConversation } from "@/lib/ai";
import { assertWithinLimit, incrementAiUsage, LimitError } from "@/lib/billing/usage";

const schema = z.object({
  conversationId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  try {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    const { conversationId } = parsed.data;

    // Billing: enforce the plan's AI-credit limit.
    try {
      await assertWithinLimit(tenantId, "ai");
    } catch (e) {
      if (e instanceof LimitError) return NextResponse.json({ success: false, error: e.message }, { status: 403 });
      throw e;
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
      include: {
        messages: {
          where: { isNote: false },
          select: { direction: true, content: true },
          orderBy: { createdAt: "asc" },
          take: 100,
        },
      },
    });

    if (!conversation) return NextResponse.json({ success: false, error: "Conversation not found" }, { status: 404 });

    const messages = conversation.messages
      .filter((m) => m.content)
      .map((m) => ({
        role: m.direction === "INBOUND" ? "user" : "assistant",
        content: m.content!,
      }));

    if (messages.length === 0) return NextResponse.json({ success: false, error: "No messages to summarize" }, { status: 400 });

    const summary = await summarizeConversation(messages);
    await incrementAiUsage(tenantId);
    return NextResponse.json({ success: true, data: { summary } });
  } catch (error) {
    console.error("[AI SUMMARIZE]", error);
    return NextResponse.json({ success: false, error: "Summarization failed" }, { status: 500 });
  }
}
