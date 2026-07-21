import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  trigger: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  nodes: z.array(z.unknown()).optional(),
  edges: z.array(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;
  const { id } = await params;

  try {
    const flow = await prisma.chatbotFlow.findFirst({ where: { id, tenantId } });
    if (!flow) return NextResponse.json({ success: false, error: "Flow not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: flow });
  } catch (error) {
    console.error("[CHATBOT FLOW GET]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch flow" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;
  const { id } = await params;

  try {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    const existing = await prisma.chatbotFlow.findFirst({ where: { id, tenantId } });
    if (!existing) return NextResponse.json({ success: false, error: "Flow not found" }, { status: 404 });

    const flow = await prisma.chatbotFlow.update({
      where: { id },
      data: parsed.data as Parameters<typeof prisma.chatbotFlow.update>[0]["data"],
    });

    return NextResponse.json({ success: true, data: flow });
  } catch (error) {
    console.error("[CHATBOT FLOW PATCH]", error);
    return NextResponse.json({ success: false, error: "Failed to update flow" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;
  const { id } = await params;

  try {
    const existing = await prisma.chatbotFlow.findFirst({ where: { id, tenantId } });
    if (!existing) return NextResponse.json({ success: false, error: "Flow not found" }, { status: 404 });

    await prisma.chatbotFlow.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CHATBOT FLOW DELETE]", error);
    return NextResponse.json({ success: false, error: "Failed to delete flow" }, { status: 500 });
  }
}
