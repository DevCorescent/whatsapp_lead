import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createPlanSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().optional(),
  priceMonthly: z.number().positive(),
  priceAnnual: z.number().positive(),
  maxContacts: z.number().int().positive(),
  maxMsgPerMonth: z.number().int().positive(),
  maxAgents: z.number().int().positive(),
  maxCampaigns: z.number().int().positive(),
  maxFlows: z.number().int().default(5),
  aiEnabled: z.boolean().default(false),
  ragEnabled: z.boolean().default(false),
  whiteLabel: z.boolean().default(false),
  advancedAi: z.boolean().default(false),
  features: z.array(z.string()).default([]),
  sortOrder: z.number().int().default(0),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const plans = await prisma.plan.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { subscriptions: true } } },
  });

  return NextResponse.json({ success: true, data: plans });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createPlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
  }

  const plan = await prisma.plan.create({ data: parsed.data });

  return NextResponse.json({ success: true, data: plan }, { status: 201 });
}

