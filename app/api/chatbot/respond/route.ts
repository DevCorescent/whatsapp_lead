import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateReply } from "@/lib/ai";
import { resolveSystemPrompt } from "@/lib/aiInstructions";
import { guardAgentAi, guardFeature, guardLimit } from "@/lib/billing/guard";
import { incrementAiUsage, planAllows } from "@/lib/billing/usage";
import { retrieveContext } from "@/lib/rag";

const schema = z.object({
  conversationId: z.string().min(1),
  flowId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, id: userId } = session.user;

  const denied = (await guardFeature(tenantId, "aiEnabled")) ?? (await guardLimit(tenantId, "ai")) ?? (await guardAgentAi(tenantId, userId));
  if (denied) return denied;

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

    // The business owns the persona; the tenant row is only the fallback. Looked up after the
    // conversation because its businessId is what scopes the lookup — a tenant running several
    // businesses must not answer in another one's voice.
    const business = await prisma.business.findUnique({
      where: { id: conversation.businessId },
      select: {
        aiInstructions: true,
        aiSystemPrompt: true,
        aiPersonality: true,
        aiTemperature: true,
        aiMaxTokens: true,
        name: true,
      },
    });

    // Has the business said anything in this thread yet? The greeting rule turns on this, and
    // the model cannot answer it from the 20-message window alone. Counted over every outbound
    // message: a thread a human agent already answered has been greeted.
    const priorOutbound = await prisma.message.count({
      where: { tenantId, conversationId: conversation.id, direction: "OUTBOUND", isNote: false },
    });

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

    // The same compiled instruction block the WhatsApp auto-reply uses, so a suggestion drafted
    // here reads like the replies the customer has already been getting. The flow's own text is
    // appended after it: a flow directs one conversation, it does not replace the business rules.
    const personality = resolveSystemPrompt({
      instructions: business?.aiInstructions,
      systemPrompt: business?.aiSystemPrompt,
      personality: business?.aiPersonality || settings?.aiPersonality,
      businessName: business?.name,
      isFirstReply: priorOutbound === 0,
    });
    const systemPrompt = `${personality}${flowInstructions}`;

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
    const retrieval = (await planAllows(tenantId, "ragEnabled"))
      ? await retrieveContext(tenantId, conversation.businessId, lastCustomerMsg)
      : { sources: [] };
    const knowledgeContext = retrieval.context;

    const reply = await generateReply(messages, systemPrompt, knowledgeContext, settings?.aiModel, {
      temperature: business?.aiTemperature,
      maxTokens: business?.aiMaxTokens,
    });
    await incrementAiUsage(tenantId, 1, userId);
    return NextResponse.json({ success: true, data: { reply, sources: retrieval.sources } });
  } catch (error) {
    console.error("[CHATBOT RESPOND]", error);
    return NextResponse.json({ success: false, error: "Chatbot response failed" }, { status: 500 });
  }
}
