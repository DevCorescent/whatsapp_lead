import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateReply } from "@/lib/ai";
import { retrieveContext } from "@/lib/rag";

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
    const lastCustomerMsg = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const knowledgeContext = await retrieveContext(tenantId, lastCustomerMsg);

    const systemPrompt = "You are a helpful WhatsApp CRM assistant. Suggest a concise, professional reply to the customer's last message.";
    const reply = await generateReply(messages, systemPrompt, knowledgeContext, settings?.aiModel);
    return NextResponse.json({ success: true, data: { reply } });
  } catch (error) {
    console.error("[AI REPLY]", error);
    return NextResponse.json({ success: false, error: "Reply generation failed" }, { status: 500 });
  }
}
