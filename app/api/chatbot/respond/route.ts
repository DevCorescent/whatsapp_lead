import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateReply } from "@/lib/ai";
import { toFlowDocument } from "@/lib/chatbot/types";
import { runFlowStep, type FlowVariables } from "@/lib/chatbot/engine";

const schema = z.object({
  conversationId: z.string().min(1),
  flowId: z.string().optional(),
  /** Optional traversal state so multi-turn flows can resume without a schema change. */
  fromNodeId: z.string().optional(),
  input: z.string().optional(),
  variables: z.record(z.string(), z.string()).optional(),
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

    const { conversationId, flowId, fromNodeId, input, variables } = parsed.data;

    const [conversation, settings, knowledgeDocs] = await Promise.all([
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
      prisma.knowledgeDoc.findMany({
        where: { tenantId, isIndexed: true },
        select: { content: true },
        take: 5,
      }),
    ]);

    if (!conversation) return NextResponse.json({ success: false, error: "Conversation not found" }, { status: 404 });

    const knowledgeContext = knowledgeDocs.map((d) => d.content).filter(Boolean).join("\n\n") || undefined;
    const personalityBase = settings?.aiPersonality ?? "You are a helpful WhatsApp business assistant.";

    // ── Deterministic flow execution ──────────────────────────────────────────
    // When a flow is attached and has a Start node, traverse it with the shared
    // engine. API/AI nodes run through injected executors (real fetch + the existing
    // generateReply), so this reuses the AI pipeline rather than duplicating it.
    // Flows without a Start node fall back to the AI-only reply below — preserving
    // the previous behaviour and the response shape.
    let flowInstructions = "";
    if (flowId) {
      const flow = await prisma.chatbotFlow.findFirst({ where: { id: flowId, tenantId } });
      if (flow) {
        const doc = toFlowDocument(flow.nodes, flow.edges);
        const hasStart = doc.nodes.some((n) => n.type === "start");

        if (hasStart && doc.nodes.length > 0) {
          const step = await runFlowStep(doc, {
            fromNodeId,
            input,
            variables: (variables ?? {}) as FlowVariables,
            executors: {
              callApi: async (node, vars) => {
                const url = node.url?.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k: string) => vars[k] ?? "");
                if (!url) return "";
                const headers: Record<string, string> = {};
                for (const h of node.headers ?? []) if (h.key) headers[h.key] = h.value;
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), Math.max(1, node.timeout ?? 15) * 1000);
                try {
                  const res = await fetch(url, {
                    method: node.method ?? "GET",
                    headers,
                    ...(node.method && node.method !== "GET" && node.body ? { body: node.body } : {}),
                    signal: controller.signal,
                  });
                  return (await res.text()).slice(0, 2000);
                } finally {
                  clearTimeout(timeout);
                }
              },
              callAi: async (node, vars) => {
                const systemPrompt = `${personalityBase}\n\n${node.prompt ?? "Reply helpfully."}`;
                const history = conversation.messages
                  .filter((m) => m.content)
                  .map((m) => ({
                    role: (m.direction === "INBOUND" ? "user" : "assistant") as "user" | "assistant",
                    content: m.content!,
                  }));
                if (input) history.push({ role: "user", content: input });
                void vars;
                return generateReply(history.length ? history : [{ role: "user", content: node.prompt ?? "" }], systemPrompt, knowledgeContext, {
                  model: node.model,
                  temperature: node.temperature,
                });
              },
            },
          });

          const messages = step.actions.filter((a) => a.type === "message" || a.type === "ai").map((a) => a.text ?? "").filter(Boolean);
          return NextResponse.json({
            success: true,
            data: {
              reply: messages.join("\n\n"),
              messages,
              variables: step.variables,
              status: step.status,
              awaitingQuestionId: step.awaitingQuestionId,
              handoff: step.handoff,
            },
          });
        }

        // Legacy fallback: fold any message/text node content into the AI system prompt.
        const textNodes = doc.nodes
          .map((n) => (n.data as { text?: string; question?: string }).text ?? (n.data as { question?: string }).question)
          .filter(Boolean)
          .join("\n");
        if (textNodes) flowInstructions = `\n\nChatbot flow instructions:\n${textNodes}`;
      }
    }

    const systemPrompt = `${personalityBase}${flowInstructions}\n\nRespond concisely and professionally in the same language as the customer.`;

    const messages = conversation.messages
      .filter((m) => m.content)
      .map((m) => ({
        role: (m.direction === "INBOUND" ? "user" : "assistant") as "user" | "assistant",
        content: m.content!,
      }));

    if (messages.length === 0) {
      return NextResponse.json({ success: false, error: "No messages to respond to" }, { status: 400 });
    }

    const reply = await generateReply(messages, systemPrompt, knowledgeContext);
    return NextResponse.json({ success: true, data: { reply } });
  } catch (error) {
    console.error("[CHATBOT RESPOND]", error);
    return NextResponse.json({ success: false, error: "Chatbot response failed" }, { status: 500 });
  }
}
