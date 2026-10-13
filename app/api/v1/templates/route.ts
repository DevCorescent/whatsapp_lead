/**
 * GET /api/v1/templates
 *
 * List approved WhatsApp templates for this tenant.
 * Clients can use this to pick a template name before calling POST /api/v1/messages.
 *
 * Auth: Authorization: Bearer <api_key>
 *
 * Query params:
 *   ?page=1&limit=20&search=order
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateV1, unauthorized } from "@/lib/v1auth";

export async function GET(req: NextRequest) {
  const scope = await authenticateV1(req);
  if (!scope) return unauthorized();

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20") || 20));
  const search = (searchParams.get("search") ?? "").trim();

  const where = {
    tenantId: scope.tenantId,
    businessId: scope.businessId,
    status: "APPROVED",
    ...(search && { name: { contains: search, mode: "insensitive" as const } }),
  };

  const [templates, total] = await Promise.all([
    prisma.messageTemplate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        language: true,
        category: true,
        status: true,
        headerType: true,
        headerContent: true,
        body: true,
        footer: true,
        buttons: true,
        createdAt: true,
      },
    }),
    prisma.messageTemplate.count({ where }),
  ]);

  return NextResponse.json({ success: true, data: templates, pagination: { page, limit, total } });
}
