import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  trigger: z.string().min(1, "Trigger is required"),
  keywords: z.array(z.string()).default([]),
  nodes: z.array(z.unknown()).default([]),
  edges: z.array(z.unknown()).default([]),
  isActive: z.boolean().default(false),
});

export async function GET(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = scope;

  try {
    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get("active") === "true";

    const flows = await prisma.chatbotFlow.findMany({
      where: {
        tenantId,
        ...(activeOnly && { isActive: true }),
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ success: true, data: flows });
  } catch (error) {
    console.error("[CHATBOT FLOWS GET]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch flows" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, businessId } = scope;

  try {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    const { name, description, trigger, keywords, nodes, edges, isActive } = parsed.data;

    const flow = await prisma.chatbotFlow.create({
      data: {
        tenantId,
        businessId,
        name,
        description,
        trigger,
        keywords,
        nodes: nodes as Parameters<typeof prisma.chatbotFlow.create>[0]["data"]["nodes"],
        edges: edges as Parameters<typeof prisma.chatbotFlow.create>[0]["data"]["edges"],
        isActive,
      },
    });

    return NextResponse.json({ success: true, data: flow }, { status: 201 });
  } catch (error) {
    console.error("[CHATBOT FLOWS POST]", error);
    return NextResponse.json({ success: false, error: "Failed to create flow" }, { status: 500 });
  }
}
