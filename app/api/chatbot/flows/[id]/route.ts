// ============================================================================
// MODULE : Chatbot Flow (single)
// ROUTE  : /api/chatbot/flows/[id]
//
// GET    - Load one flow.
// PATCH  - Rename (name/description/keywords), save the canvas (nodes/edges),
//          or publish/unpublish (isActive). Publishing runs the full flow
//          validation and is refused if the flow has structural errors.
// DELETE - Remove a flow.
//
// Every query is scoped by tenantId, so a flow belonging to another workspace is
// indistinguishable from one that does not exist.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateFlowSchema } from "@/lib/validators/chatbot";
import { validateFlow, type FlowNode, type FlowEdge } from "@/lib/chatbot";

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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { tenantId } = session.user;

  try {
    const { id } = await params;
    const flow = await prisma.chatbotFlow.findFirst({
      where: { id, tenantId },
      select: flowSelect,
    });
    if (!flow) {
      return NextResponse.json({ success: false, error: "Flow not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: flow });
  } catch (error) {
    console.error("[CHATBOT FLOW GET]", error);
    return NextResponse.json({ success: false, error: "Failed to load flow" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { tenantId, role } = session.user;
  if (!EDIT_ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateFlowSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  try {
    const existing = await prisma.chatbotFlow.findFirst({
      where: { id, tenantId },
      select: { id: true, nodes: true, edges: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Flow not found" }, { status: 404 });
    }

    const d = parsed.data;

    // Publishing is only allowed for a structurally valid flow. Validate against
    // the nodes/edges being saved in this same request, falling back to what is
    // already stored when the publish toggle is sent on its own.
    if (d.isActive === true) {
      const nodes = (d.nodes ?? (existing.nodes as unknown as FlowNode[])) ?? [];
      const edges = (d.edges ?? (existing.edges as unknown as FlowEdge[])) ?? [];
      const result = validateFlow(nodes, edges);
      if (!result.ok) {
        return NextResponse.json(
          {
            success: false,
            error: "Fix these before publishing: " + result.errors.map((e) => e.message).join(" "),
          },
          { status: 400 },
        );
      }
    }

    const data: Prisma.ChatbotFlowUpdateInput = {};
    if (d.name !== undefined) data.name = d.name;
    if (d.description !== undefined) data.description = d.description;
    if (d.keywords !== undefined) data.keywords = d.keywords;
    if (d.nodes !== undefined) data.nodes = d.nodes as unknown as Prisma.InputJsonValue;
    if (d.edges !== undefined) data.edges = d.edges as unknown as Prisma.InputJsonValue;
    if (d.isActive !== undefined) data.isActive = d.isActive;

    const flow = await prisma.chatbotFlow.update({
      where: { id },
      data,
      select: flowSelect,
    });

    return NextResponse.json({ success: true, data: flow });
  } catch (error) {
    console.error("[CHATBOT FLOW PATCH]", error);
    return NextResponse.json({ success: false, error: "Failed to update flow" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { tenantId, role } = session.user;
  if (!EDIT_ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const existing = await prisma.chatbotFlow.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Flow not found" }, { status: 404 });
    }

    await prisma.chatbotFlow.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CHATBOT FLOW DELETE]", error);
    return NextResponse.json({ success: false, error: "Failed to delete flow" }, { status: 500 });
  }
}
