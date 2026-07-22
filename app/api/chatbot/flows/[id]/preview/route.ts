import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runFlowStep, type FlowVariables } from "@/lib/chatbot/engine";
import { toFlowDocument } from "@/lib/chatbot/types";

const schema = z.object({
  nodes: z.array(z.unknown()).optional(),
  edges: z.array(z.unknown()).optional(),
  fromNodeId: z.string().optional(),
  input: z.string().optional(),
  variables: z.record(z.string(), z.string()).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;
  const { id } = await params;

  try {
    const flow = await prisma.chatbotFlow.findFirst({ where: { id, tenantId } });
    if (!flow) return NextResponse.json({ success: false, error: "Flow not found" }, { status: 404 });

    let body: unknown = {};
    try { body = await req.json(); } catch {}
    const parsed = schema.safeParse(body ?? {});
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    const doc = toFlowDocument(parsed.data.nodes ?? flow.nodes, parsed.data.edges ?? flow.edges);
    const step = await runFlowStep(doc, {
      fromNodeId: parsed.data.fromNodeId,
      input: parsed.data.input,
      variables: (parsed.data.variables ?? {}) as FlowVariables,
      executors: {
        callApi: async () => "[simulated API response]",
        callAi: async (node) => `[AI reply${node.prompt ? `: ${node.prompt.slice(0, 40)}` : ""}]`,
      },
    });

    return NextResponse.json({ success: true, data: step });
  } catch (error) {
    console.error("[CHATBOT FLOW PREVIEW]", error);
    return NextResponse.json({ success: false, error: "Failed to preview flow" }, { status: 500 });
  }
}
