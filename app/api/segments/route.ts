// ============================================================================
// ROUTE : /api/segments
//
// GET  - Saved segments for the active business, each with its live matching count.
// POST - Save a segment { name, description?, rules }.
//
// campaigns.view to list, campaigns.send to save. Rules: lib/segmentRules.ts.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";
import { requirePermission } from "@/lib/permissions";
import { segmentFiltersSchema } from "@/lib/segmentRules";
import { segmentWhere } from "@/lib/segments";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  description: z.string().trim().max(300).optional(),
  rules: segmentFiltersSchema.shape.rules,
});

export async function GET() {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermission(scope, "campaigns.view");
  if (denied) return denied;

  const segments = await prisma.segment.findMany({
    where: { tenantId: scope.tenantId, businessId: scope.businessId },
    orderBy: { updatedAt: "desc" },
  });

  // Live counts. A segment whose saved rules no longer validate counts as 0 rather than failing the list.
  const data = await Promise.all(
    segments.map(async (s) => {
      const parsed = segmentFiltersSchema.safeParse(s.filters);
      const count = parsed.success
        ? await prisma.contact.count({ where: await segmentWhere(scope.tenantId, scope.businessId, parsed.data.rules) })
        : 0;
      return { ...s, rules: parsed.success ? parsed.data.rules : [], count };
    }),
  );
  return NextResponse.json({ success: true, data });
}

export async function POST(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermission(scope, "campaigns.send");
  if (denied) return denied;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

  const segment = await prisma.segment.create({
    data: {
      tenantId: scope.tenantId,
      businessId: scope.businessId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      filters: { rules: parsed.data.rules },
      createdById: scope.userId,
    },
  });
  return NextResponse.json({ success: true, data: segment }, { status: 201 });
}
