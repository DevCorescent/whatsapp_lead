import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toFlowDocument } from "@/lib/chatbot/types";
import { validateFlow } from "@/lib/chatbot/validation";

const bodySchema = z.object({
  nodes: z.array(z.unknown()).optional(),
  edges: z.array(z.unknown()).optional(),
});

/**
 * Validate a flow before publishing. Validates the nodes/edges in the request body
 * when provided (so the builder can check unsaved state), otherwise the stored flow.
 * Tenant-scoped; reuses the shared validation library that also gates the client.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;
  const { id } = await params;

  try {
    const flow = await prisma.chatbotFlow.findFirst({ where: { id, tenantId } });
    if (!flow) return NextResponse.json({ success: false, error: "Flow not found" }, { status: 404 });

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      // No body → validate the stored flow.
    }
    const parsed = bodySchema.safeParse(body ?? {});
    const nodes = parsed.success && parsed.data.nodes !== undefined ? parsed.data.nodes : flow.nodes;
    const edges = parsed.success && parsed.data.edges !== undefined ? parsed.data.edges : flow.edges;

    const result = validateFlow(toFlowDocument(nodes, edges));
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[CHATBOT FLOW VALIDATE]", error);
    return NextResponse.json({ success: false, error: "Failed to validate flow" }, { status: 500 });
  }
}
