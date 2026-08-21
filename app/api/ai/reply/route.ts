import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateReplyStream } from "@/lib/ai";
import { guardAgentAi, guardFeature, guardLimit } from "@/lib/billing/guard";
import { incrementAiUsage, planAllows } from "@/lib/billing/usage";
import { retrieveContext } from "@/lib/rag";

const schema = z.object({
  conversationId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, id: userId } = session.user;

  // An agent is waiting on this one, so both refusals are 403s that open the
  // upgrade dialog rather than the silent skip the auto-reply worker takes.
  const denied = (await guardFeature(tenantId, "aiEnabled")) ?? (await guardLimit(tenantId, "ai")) ?? (await guardAgentAi(tenantId, userId));
  if (denied) return denied;

  try {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    const { conversationId } = parsed.data;

    const [conversation, settings] = await Promise.all([
      prisma.conversation.findFirst({
        where: { id: conversationId, tenantId },
        include: {
          messages: {
            where: { isNote: false },
            select: { direction: true, content: true },
            orderBy: { createdAt: "asc" },
            take: 30,
          },
        },
      }),
      prisma.tenantSettings.findUnique({ where: { tenantId }, select: { aiModel: true } }),
    ]);

    if (!conversation) return NextResponse.json({ success: false, error: "Conversation not found" }, { status: 404 });

    const messages = conversation.messages
      .filter((m) => m.content)
      .map((m) => ({
        role: (m.direction === "INBOUND" ? "user" : "assistant") as "user" | "assistant",
        content: m.content!,
      }));

    if (messages.length === 0) return NextResponse.json({ success: false, error: "No messages to reply to" }, { status: 400 });

    // RAG: retrieve only the chunks relevant to the customer's latest question.
    // Ungrounded rather than refused on a tier without the knowledge base — the
    // suggestion is still useful, it just has nothing to cite.
    const lastCustomerMsg = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const retrieval = (await planAllows(tenantId, "ragEnabled"))
      ? await retrieveContext(tenantId, conversation.businessId, lastCustomerMsg)
      : { sources: [] };
    const knowledgeContext = retrieval.context;

    const systemPrompt = "You are a helpful WhatsApp CRM assistant. Suggest a concise, professional reply to the customer's last message.";
    const streamIterable = await generateReplyStream(messages, systemPrompt, knowledgeContext, settings?.aiModel);

    // Charged once the model has accepted the request. The stream below can still
    // be interrupted mid-flight, but the tokens are spent either way.
    await incrementAiUsage(tenantId, 1, userId);

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          // Sent ahead of the first token, on its own frame. The composer can show
          // which documents the draft is grounded in while it is still being
          // written, and a client that only reads `chunk` ignores this safely.
          if (retrieval.sources.length > 0) {
            const frame = "data: " + JSON.stringify({ sources: retrieval.sources }) + "\n\n";
            controller.enqueue(encoder.encode(frame));
          }

          for await (const chunk of streamIterable) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`));
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          console.error("[AI REPLY STREAM]", err);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Stream interrupted" })}\n\n`));
        }
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[AI REPLY]", error);
    return NextResponse.json({ success: false, error: "Reply generation failed" }, { status: 500 });
  }
}
