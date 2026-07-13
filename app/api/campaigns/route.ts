import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CampaignStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
}).refine((d) => d.templateId || d.message, { message: "Either templateId or message is required" });

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

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
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  try {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

    const parsed = createCampaignSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    const { name, templateId, contactIds, tagIds, all } = parsed.data;

    // Resolve target contacts
    let contacts: { id: string; phone: string }[] = [];
    if (all) {
      contacts = await prisma.contact.findMany({
        where: { tenantId, isBlocked: false, optedOut: false },
        select: { id: true, phone: true },
      });
    } else if (tagIds && tagIds.length > 0) {
      contacts = await prisma.contact.findMany({
        where: { tenantId, isBlocked: false, optedOut: false, tags: { some: { tagId: { in: tagIds } } } },
        select: { id: true, phone: true },
      });
    } else if (contactIds && contactIds.length > 0) {
      contacts = await prisma.contact.findMany({
        where: { id: { in: contactIds }, tenantId, isBlocked: false, optedOut: false },
        select: { id: true, phone: true },
      });
    }

    // Create campaign as DRAFT with contact rows
    const campaign = await prisma.campaign.create({
      data: {
        tenantId,
        name,
        ...(templateId && { templateId }),
        status: "DRAFT",
        totalCount: contacts.length,
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

    return NextResponse.json({ success: true, data: campaign }, { status: 201 });
  } catch (error) {
    console.error("[CAMPAIGNS POST]", error);
    return NextResponse.json({ success: false, error: "Failed to create campaign" }, { status: 500 });
  }
}
