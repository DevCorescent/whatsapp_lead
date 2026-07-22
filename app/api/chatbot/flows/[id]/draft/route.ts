import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;
  const { id } = await params;

  try {
    const existing = await prisma.chatbotFlow.findFirst({ where: { id, tenantId } });
    if (!existing) return NextResponse.json({ success: false, error: "Flow not found" }, { status: 404 });

    const flow = await prisma.chatbotFlow.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ success: true, data: flow });
  } catch (error) {
    console.error("[CHATBOT FLOW DRAFT]", error);
    return NextResponse.json({ success: false, error: "Failed to move flow to draft" }, { status: 500 });
  }
}
