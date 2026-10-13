import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";
import { requirePermission } from "@/lib/permissions";
import { generateWebhookSecret, WEBHOOK_EVENTS } from "@/lib/webhooks";
import { z } from "zod";

const CreateSchema = z.object({
  url: z.string().url("Must be a valid URL (https://...)"),
  description: z.string().max(255).optional(),
  events: z
    .array(z.enum([...WEBHOOK_EVENTS] as [string, ...string[]]))
    .min(1, "Select at least one event"),
});

export async function GET() {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermission(scope, "settings.manage");
  if (denied) return denied;

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { tenantId: scope.tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { deliveries: true } },
    },
  });

  return NextResponse.json({ success: true, endpoints });
}

export async function POST(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermission(scope, "settings.manage");
  if (denied) return denied;

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 422 },
    );
  }

  const { url, description, events } = parsed.data;

  const existing = await prisma.webhookEndpoint.count({ where: { tenantId: scope.tenantId } });
  if (existing >= 10) {
    return NextResponse.json(
      { success: false, error: "Maximum 10 webhook endpoints allowed." },
      { status: 422 },
    );
  }

  const secret = generateWebhookSecret();
  const endpoint = await prisma.webhookEndpoint.create({
    data: { tenantId: scope.tenantId, url, description, events, secret },
  });

  return NextResponse.json({ success: true, endpoint: { ...endpoint, secret } }, { status: 201 });
}
