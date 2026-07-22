import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  nodes: z.array(z.unknown()).optional(),
  edges: z.array(z.unknown()).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;
  const { id } = await params;

  try {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    const existing = await prisma.chatbotFlow.findFirst({ where: { id, tenantId } });
    if (!existing) return NextResponse.json({ success: false, error: "Flow not found" }, { status: 404 });

    const data = {
      ...(parsed.data.nodes !== undefined && { nodes: parsed.data.nodes }),
      ...(parsed.data.edges !== undefined && { edges: parsed.data.edges }),
    } as Parameters<typeof prisma.chatbotFlow.update>[0]["data"];

    const flow = await prisma.chatbotFlow.update({ where: { id }, data });

    return NextResponse.json({ success: true, data: flow });
  } catch (error) {
    console.error("[CHATBOT FLOW AUTOSAVE]", error);
    return NextResponse.json({ success: false, error: "Failed to autosave flow" }, { status: 500 });
  }
}
