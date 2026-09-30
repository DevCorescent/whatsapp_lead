// ============================================================================
// ROUTE : /api/segments/[id]
//
// PATCH  - Rename, re-describe or change the rules of a saved segment.
// DELETE - Delete it. Campaigns already sent to it keep their recipient lists.
//
// campaigns.send; active business only.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";
import { requirePermission } from "@/lib/permissions";
import { segmentFiltersSchema } from "@/lib/segmentRules";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  rules: segmentFiltersSchema.shape.rules.optional(),
});

async function gate(id: string) {
  const scope = await getBusinessScope();
  if (!scope) return { error: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
  const denied = await requirePermission(scope, "campaigns.send");
  if (denied) return { error: denied };
  const segment = await prisma.segment.findFirst({
    where: { id, tenantId: scope.tenantId, businessId: scope.businessId },
    select: { id: true },
  });
  if (!segment) return { error: NextResponse.json({ success: false, error: "Segment not found" }, { status: 404 }) };
  return { segment };
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const { segment, error } = await gate(id);
  if (error) return error;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
  const { name, description, rules } = parsed.data;

  const updated = await prisma.segment.update({
    where: { id: segment!.id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description: description || null }),
      ...(rules !== undefined && { filters: { rules } }),
    },
  });
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const { segment, error } = await gate(id);
  if (error) return error;
  await prisma.segment.delete({ where: { id: segment!.id } });
  return NextResponse.json({ success: true });
}
