import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateReply } from "@/lib/ai";

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

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
      include: {
        messages: {
          where: { isNote: false },
          select: { direction: true, content: true },
          orderBy: { createdAt: "asc" },
          take: 30,
        },
      },
    });

    if (!conversation) return NextResponse.json({ success: false, error: "Conversation not found" }, { status: 404 });

    // Get knowledge base context
    const knowledgeDocs = await prisma.knowledgeDoc.findMany({
      where: { tenantId, isIndexed: true },
      select: { content: true },
      take: 5,
    });
    const knowledgeContext = knowledgeDocs.map((d) => d.content).filter(Boolean).join("\n\n") || undefined;

    const messages = conversation.messages
      .filter((m) => m.content)
      .map((m) => `${m.direction === "INBOUND" ? "Customer" : "Agent"}: ${m.content}`);

    if (messages.length === 0) return NextResponse.json({ success: false, error: "No messages to reply to" }, { status: 400 });

    const reply = await generateReply(messages, knowledgeContext);
    return NextResponse.json({ success: true, data: { reply } });
  } catch (error) {
    console.error("[AI REPLY]", error);
    return NextResponse.json({ success: false, error: "Reply generation failed" }, { status: 500 });
  }
}
