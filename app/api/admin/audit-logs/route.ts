import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "50"));
  const q = searchParams.get("q") ?? "";

  const where = q
    ? {
        OR: [
          { action: { contains: q, mode: "insensitive" as const } },
          { resource: { contains: q, mode: "insensitive" as const } },
          { user: { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }] } },
        ],
      }
    : {};

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        tenant: { select: { name: true, slug: true } },
        user: { select: { name: true, email: true } },
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      data: logs.map((log) => ({
        id: log.id,
        action: log.action,
        resource: log.resource,
        resourceId: log.resourceId,
        createdAt: log.createdAt.toISOString(),
        tenant: log.tenant,
        user: log.user,
      })),
      total,
    },
  });
}
