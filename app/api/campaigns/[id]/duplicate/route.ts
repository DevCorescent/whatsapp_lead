import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { tenantId } = session.user;
  const { id } = await params;

  try {
    const source = await prisma.campaign.findFirst({
      where: { id, tenantId },
      select: { name: true, metadata: true, templateId: true, businessId: true },
    });

    if (!source) {
      return NextResponse.json({ success: false, error: "Campaign not found" }, { status: 404 });
    }

    const copy = await prisma.campaign.create({
      data: {
        tenantId,
        businessId: source.businessId,
        name: `${source.name} (copy)`,
        templateId: source.templateId,
        metadata: source.metadata ?? undefined,
        status: "DRAFT",
      },
    });

    return NextResponse.json({ success: true, data: copy }, { status: 201 });
  } catch (error) {
    console.error("[CAMPAIGNS/DUPLICATE]", error);
    return NextResponse.json({ success: false, error: "Failed to duplicate campaign" }, { status: 500 });
  }
}
