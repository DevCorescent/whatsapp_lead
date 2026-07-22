import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CampaignStatus, Prisma } from "@prisma/client";
import { getBusinessScope } from "@/lib/business";
import { prisma } from "@/lib/prisma";
import { runCampaign, CampaignClaimError } from "@/lib/campaigns/runner";
import { assertWithinLimit, LimitError } from "@/lib/billing/usage";

const querySchema = z.object({
  status: z.nativeEnum(CampaignStatus).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

const createCampaignSchema = z.object({
  name: z.string().min(1, "Campaign name is required"),
  templateId: z.string().optional(),
  message: z.string().optional(),
  contactIds: z.array(z.string()).optional(),
  tagIds: z.array(z.string()).optional(),
  all: z.boolean().optional(),
  // Scheduling: an ISO datetime saves the campaign as SCHEDULED; `sendNow` (with
  // no schedule) sends immediately; neither leaves it as a DRAFT.
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  sendNow: z.boolean().optional(),
}).refine((d) => d.templateId || d.message, { message: "Either templateId or message is required" });

export async function GET(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, businessId } = scope;

  try {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      status: searchParams.get("status") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    const { status, page, limit } = parsed.data;
    const where = {
      tenantId,
      businessId,
      ...(status !== undefined && { status }),
    };

    const [total, campaigns] = await Promise.all([
      prisma.campaign.count({ where }),
      prisma.campaign.findMany({
        where,
        include: {
          template: { select: { id: true, name: true, category: true } },
          _count: { select: { contacts: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: campaigns,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("[CAMPAIGNS GET]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch campaigns" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, businessId } = scope;

  try {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

    const parsed = createCampaignSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    // Billing: enforce the plan's campaigns-per-period limit.
    try {
      await assertWithinLimit(tenantId, "campaigns");
    } catch (e) {
      if (e instanceof LimitError) return NextResponse.json({ success: false, error: e.message }, { status: 403 });
      throw e;
    }

    const { name, templateId, message, contactIds, tagIds, all, sendNow } = parsed.data;

    // Resolve schedule: reject a schedule set in the past, otherwise decide the
    // campaign's initial status from the scheduling inputs.
    let scheduledAt: Date | null = null;
    if (parsed.data.scheduledAt) {
      scheduledAt = new Date(parsed.data.scheduledAt);
      if (scheduledAt.getTime() <= Date.now()) {
        return NextResponse.json(
          { success: false, error: "Scheduled time must be in the future" },
          { status: 400 },
        );
      }
    }
    const initialStatus: CampaignStatus = scheduledAt ? "SCHEDULED" : "DRAFT";

    // Resolve target contacts
    let contacts: { id: string; phone: string }[] = [];
    if (all) {
      contacts = await prisma.contact.findMany({
        where: { tenantId, businessId, isBlocked: false, optedOut: false },
        select: { id: true, phone: true },
      });
    } else if (tagIds && tagIds.length > 0) {
      contacts = await prisma.contact.findMany({
        where: { tenantId, businessId, isBlocked: false, optedOut: false, tags: { some: { tagId: { in: tagIds } } } },
        select: { id: true, phone: true },
      });
    } else if (contactIds && contactIds.length > 0) {
      contacts = await prisma.contact.findMany({
        where: { id: { in: contactIds }, tenantId, businessId, isBlocked: false, optedOut: false },
        select: { id: true, phone: true },
      });
    }

    // Create campaign with its contact rows. The broadcast body is stored on
    // `metadata.message` so the runner (immediate or scheduled) can read it.
    const campaign = await prisma.campaign.create({
      data: {
        tenantId,
        businessId,
        name,
        ...(templateId && { templateId }),
        status: initialStatus,
        scheduledAt,
        totalCount: contacts.length,
        ...(message && { metadata: { message } as Prisma.InputJsonValue }),
        ...(contacts.length > 0 && {
          contacts: {
            create: contacts.map((c) => ({
              contactId: c.id,
              phone: c.phone,
              status: "PENDING",
            })),
          },
        }),
      },
      include: {
        template: { select: { id: true, name: true } },
        _count: { select: { contacts: true } },
      },
    });

    // Immediate send: no schedule and the caller asked to send now.
    if (!scheduledAt && sendNow) {
      try {
        await runCampaign(campaign.id);
      } catch (error) {
        if (!(error instanceof CampaignClaimError)) {
          console.error("[CAMPAIGNS POST] immediate send failed:", error);
        }
      }
      const fresh = await prisma.campaign.findUnique({
        where: { id: campaign.id },
        include: {
          template: { select: { id: true, name: true } },
          _count: { select: { contacts: true } },
        },
      });
      return NextResponse.json({ success: true, data: fresh ?? campaign }, { status: 201 });
    }

    return NextResponse.json({ success: true, data: campaign }, { status: 201 });
  } catch (error) {
    console.error("[CAMPAIGNS POST]", error);
    return NextResponse.json({ success: false, error: "Failed to create campaign" }, { status: 500 });
  }
}
