import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";
import { requirePermission } from "@/lib/permissions";
import { z } from "zod";
import { WEBHOOK_EVENTS } from "@/lib/webhooks";

const UpdateSchema = z.object({
  url: z.string().url().optional(),
  description: z.string().max(255).optional(),
  events: z.array(z.enum([...WEBHOOK_EVENTS] as [string, ...string[]])).min(1).optional(),
  isActive: z.boolean().optional(),
});

async function getEndpoint(id: string, tenantId: string) {
  return prisma.webhookEndpoint.findFirst({ where: { id, tenantId } });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermission(scope, "settings.manage");
  if (denied) return denied;

  const { id } = await params;
  const ep = await getEndpoint(id, scope.tenantId);
  if (!ep) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const deliveries = await prisma.webhookDelivery.findMany({
    where: { endpointId: id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({ success: true, endpoint: ep, deliveries });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermission(scope, "settings.manage");
  if (denied) return denied;

  const { id } = await params;
  const ep = await getEndpoint(id, scope.tenantId);
  if (!ep) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 422 },
    );
  }

  const updated = await prisma.webhookEndpoint.update({
    where: { id },
    data: parsed.data,
  });

  return NextResponse.json({ success: true, endpoint: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermission(scope, "settings.manage");
  if (denied) return denied;

  const { id } = await params;
  const ep = await getEndpoint(id, scope.tenantId);
  if (!ep) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  await prisma.webhookEndpoint.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
