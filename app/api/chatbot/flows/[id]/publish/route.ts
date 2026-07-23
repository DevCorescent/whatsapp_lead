import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toFlowDocument } from "@/lib/chatbot/types";
import { validateFlow } from "@/lib/chatbot/validation";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;
  const { id } = await params;

  try {
    const existing = await prisma.chatbotFlow.findFirst({ where: { id, tenantId } });
    if (!existing) return NextResponse.json({ success: false, error: "Flow not found" }, { status: 404 });

    const validation = validateFlow(toFlowDocument(existing.nodes, existing.edges));
    if (!validation.valid) return NextResponse.json({ success: false, error: "Flow validation failed", data: validation }, { status: 400 });

    const flow = await prisma.chatbotFlow.update({ where: { id }, data: { isActive: true } });
    return NextResponse.json({ success: true, data: flow });
  } catch (error) {
    console.error("[CHATBOT FLOW PUBLISH]", error);
    return NextResponse.json({ success: false, error: "Failed to publish flow" }, { status: 500 });
  }
}
