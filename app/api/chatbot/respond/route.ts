import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateReply } from "@/lib/ai";
import { retrieveContext } from "@/lib/rag";

const schema = z.object({
  conversationId: z.string().min(1),
  flowId: z.string().optional(),
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

    const { conversationId, flowId } = parsed.data;

    const [conversation, settings] = await Promise.all([
      prisma.conversation.findFirst({
        where: { id: conversationId, tenantId },
        include: {
          messages: {
            where: { isNote: false },
            select: { direction: true, content: true },
            orderBy: { createdAt: "asc" },
            take: 20,
          },
        },
      }),
      prisma.tenantSettings.findUnique({
        where: { tenantId },
        select: { aiPersonality: true, aiModel: true },
      }),
    ]);

    if (!conversation) return NextResponse.json({ success: false, error: "Conversation not found" }, { status: 404 });

    // Build flow instructions if a flow is attached
    let flowInstructions = "";
    if (flowId) {
      const flow = await prisma.chatbotFlow.findFirst({ where: { id: flowId, tenantId } });
      if (flow?.nodes) {
        const textNodes = (flow.nodes as { data?: { text?: string } }[])
          .filter((n) => n.data?.text)
          .map((n) => n.data!.text)
          .join("\n");
        if (textNodes) flowInstructions = `\n\nChatbot flow instructions:\n${textNodes}`;
      }
    }

    const personality = settings?.aiPersonality ?? "You are a helpful WhatsApp business assistant.";
    const systemPrompt = `${personality}${flowInstructions}\n\nRespond concisely and professionally in the same language as the customer.`;

    const messages = conversation.messages
      .filter((m) => m.content)
      .map((m) => ({
        role: (m.direction === "INBOUND" ? "user" : "assistant") as "user" | "assistant",
        content: m.content!,
      }));

    if (messages.length === 0) {
      return NextResponse.json({ success: false, error: "No messages to respond to" }, { status: 400 });
    }

    // RAG: pull only the chunks relevant to the customer's latest message.
    const lastCustomerMsg = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const knowledgeContext = await retrieveContext(tenantId, lastCustomerMsg);

    const reply = await generateReply(messages, systemPrompt, knowledgeContext);
    return NextResponse.json({ success: true, data: { reply } });
  } catch (error) {
    console.error("[CHATBOT RESPOND]", error);
    return NextResponse.json({ success: false, error: "Chatbot response failed" }, { status: 500 });
  }
}
