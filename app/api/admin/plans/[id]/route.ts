import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const updatePlanSchema = z.object({
  displayName: z.string().min(1).optional(),
  description: z.string().optional(),
  priceMonthly: z.number().nonnegative().optional(),
  priceAnnual: z.number().nonnegative().optional(),
  maxContacts: z.number().int().positive().optional(),
  maxMsgPerMonth: z.number().int().positive().optional(),
  maxAgents: z.number().int().positive().optional(),
  maxCampaigns: z.number().int().positive().optional(),
  maxFlows: z.number().int().positive().optional(),
  aiEnabled: z.boolean().optional(),
  ragEnabled: z.boolean().optional(),
  whiteLabel: z.boolean().optional(),
  advancedAi: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const plan = await prisma.plan.findUnique({
    where: { id },
    include: { _count: { select: { subscriptions: true } } },
  });
  if (!plan) return NextResponse.json({ success: false, error: "Plan not found" }, { status: 404 });

  return NextResponse.json({ success: true, data: plan });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan) return NextResponse.json({ success: false, error: "Plan not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updatePlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
  }

  const updated = await prisma.plan.update({ where: { id }, data: parsed.data });

  console.log("[admin/plans/[id]] updated plan:", id, JSON.stringify(parsed.data));

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const plan = await prisma.plan.findUnique({
    where: { id },
    include: { _count: { select: { subscriptions: true } } },
  });
  if (!plan) return NextResponse.json({ success: false, error: "Plan not found" }, { status: 404 });
  if (plan._count.subscriptions > 0) {
    return NextResponse.json(
      { success: false, error: `Cannot delete — ${plan._count.subscriptions} active subscription(s)` },
      { status: 409 }
    );
  }

  await prisma.plan.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
