import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";

/**
 * Duplicate a flow. Reuses the existing ChatbotFlow model — copies nodes/edges/
 * keywords/trigger verbatim, starts the copy as an inactive draft. Tenant-scoped.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, businessId } = scope;
  const { id } = await params;

  try {
    const source = await prisma.chatbotFlow.findFirst({ where: { id, tenantId } });
    if (!source) return NextResponse.json({ success: false, error: "Flow not found" }, { status: 404 });

    const flow = await prisma.chatbotFlow.create({
      data: {
        tenantId,
        businessId,
        name: `${source.name} (copy)`,
        description: source.description,
        trigger: source.trigger,
        keywords: source.keywords,
        nodes: source.nodes as Parameters<typeof prisma.chatbotFlow.create>[0]["data"]["nodes"],
        edges: source.edges as Parameters<typeof prisma.chatbotFlow.create>[0]["data"]["edges"],
        isActive: false,
      },
    });

    return NextResponse.json({ success: true, data: flow }, { status: 201 });
  } catch (error) {
    console.error("[CHATBOT FLOW DUPLICATE]", error);
    return NextResponse.json({ success: false, error: "Failed to duplicate flow" }, { status: 500 });
  }
}
