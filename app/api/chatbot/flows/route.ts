// ============================================================================
// MODULE : Chatbot Flows
// ROUTE  : /api/chatbot/flows
//
// GET  - List the tenant's flows (with nodes/edges so the editor can hydrate).
// POST - Create a new flow, seeded with a single Start node.
//
// ACCESS
// GET  - Any authenticated member of the tenant.
// POST - TENANT_OWNER, ADMIN, MANAGER (or SUPER_ADMIN).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createFlowSchema } from "@/lib/validators/chatbot";
import type { FlowNode } from "@/lib/chatbot";

const EDIT_ROLES = ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN", "MANAGER"];

const flowSelect = {
  id: true,
  name: true,
  description: true,
  keywords: true,
  isActive: true,
  nodes: true,
  edges: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { tenantId } = session.user;

  try {
    const flows = await prisma.chatbotFlow.findMany({
      where: { tenantId },
      select: flowSelect,
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ success: true, data: flows });
  } catch (error) {
    console.error("[CHATBOT FLOWS GET]", error);
    return NextResponse.json({ success: false, error: "Failed to load flows" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { tenantId, role } = session.user;
  if (!EDIT_ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createFlowSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  try {
    // Every flow begins with exactly one Start node, so it is seeded here rather
    // than left to the client — a flow can never exist without its entry point.
    const startNode: FlowNode = {
      id: "n_start",
      type: "start",
      position: { x: 80, y: 220 },
      data: {},
    };

    const flow = await prisma.chatbotFlow.create({
      data: {
        tenantId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        keywords: parsed.data.keywords ?? [],
        trigger: "keyword",
        nodes: [startNode] as unknown as Prisma.InputJsonValue,
        edges: [] as unknown as Prisma.InputJsonValue,
        isActive: false,
      },
      select: flowSelect,
    });

    return NextResponse.json({ success: true, data: flow }, { status: 201 });
  } catch (error) {
    console.error("[CHATBOT FLOWS POST]", error);
    return NextResponse.json({ success: false, error: "Failed to create flow" }, { status: 500 });
  }
}
