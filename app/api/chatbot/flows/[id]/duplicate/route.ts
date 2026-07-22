// ============================================================================
// ROUTE  : POST /api/chatbot/flows/[id]/duplicate
//
// Clone a flow (its nodes, edges and keywords) into a new, unpublished copy named
// "<original> (copy)". Scoped by tenantId so a flow can only be duplicated within
// the workspace that owns it.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getBusinessScope } from "@/lib/business";
import { prisma } from "@/lib/prisma";

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

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getBusinessScope();
  if (!scope) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { tenantId, businessId, role } = scope;
  if (!EDIT_ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const source = await prisma.chatbotFlow.findFirst({
      where: { id, tenantId, businessId },
      select: { name: true, description: true, keywords: true, trigger: true, nodes: true, edges: true },
    });
    if (!source) {
      return NextResponse.json({ success: false, error: "Flow not found" }, { status: 404 });
    }

    const copy = await prisma.chatbotFlow.create({
      data: {
        tenantId,
        businessId,
        name: `${source.name} (copy)`,
        description: source.description,
        keywords: source.keywords,
        trigger: source.trigger,
        // The node/edge JSON is copied verbatim — a clone is structurally identical.
        nodes: (source.nodes ?? []) as Prisma.InputJsonValue,
        edges: (source.edges ?? []) as Prisma.InputJsonValue,
        isActive: false, // a duplicate always starts unpublished
      },
      select: flowSelect,
    });

    return NextResponse.json({ success: true, data: copy }, { status: 201 });
  } catch (error) {
    console.error("[CHATBOT FLOW DUPLICATE]", error);
    return NextResponse.json({ success: false, error: "Failed to duplicate flow" }, { status: 500 });
  }
}
