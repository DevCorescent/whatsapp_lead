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
  // 0 means unlimited for these four (isUnlimited in lib/billing/tiers.ts), so
  // they are nonnegative rather than positive. maxBusinesses defaults to 1: a
  // new tier grants the one workspace an account starts with unless said otherwise.
  maxMsgPerDay: z.number().int().nonnegative().default(0),
  maxMsgPerHour: z.number().int().nonnegative().default(0),
  maxBusinesses: z.number().int().nonnegative().default(1),
  maxKnowledgeDocs: z.number().int().nonnegative().default(0),
  maxTemplates: z.number().int().nonnegative().default(0),
  maxQuickReplies: z.number().int().nonnegative().default(0),
  maxCampaignRecipients: z.number().int().nonnegative().default(0),
  maxUploadMb: z.number().int().nonnegative().default(10),
  // 0 means "keep forever" — the retention cron skips any plan at 0.
  retentionDays: z.number().int().nonnegative().default(0),
  allowedAiModels: z.array(z.string().min(1)).default([]),
  allowExport: z.boolean().default(true),
  isPopular: z.boolean().default(false),
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

  // Filtered rather than a bare count of the relation. This number is both the
  // "N subscribers" on each card and the input to which plan gets the "Most
  // Popular" badge, and an unfiltered count includes CANCELLED and EXPIRED rows
  // — so a tier everyone has churned off could out-rank one people are actually
  // paying for. PAST_DUE stays in: that is a failed payment, not a departure.
  const plans = await prisma.plan.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      _count: {
        select: {
          subscriptions: {
            where: { status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
          },
        },
      },
    },
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

  // Same at-most-one rule as PATCH: a plan created as popular takes the badge
  // from whichever plan held it, in one transaction so it cannot land on two.
  const plan = await prisma.$transaction(async (tx) => {
    if (parsed.data.isPopular) {
      await tx.plan.updateMany({ where: { isPopular: true }, data: { isPopular: false } });
    }
    return tx.plan.create({ data: parsed.data });
  });

  return NextResponse.json({ success: true, data: plan }, { status: 201 });
}

