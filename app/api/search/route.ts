import { NextRequest, NextResponse } from "next/server";
import { getBusinessScope } from "@/lib/business";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, businessId } = scope;

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";

  const emptyResult = {
    contacts: [],
    leads: [],
    conversations: [],
    messages: [],
    campaigns: [],
  };

  if (q.length < 2) return NextResponse.json({ success: true, data: emptyResult });

  try {
    const [contacts, leads, conversations, messages, campaigns] = await Promise.all([
      prisma.contact.findMany({
        where: {
          tenantId,
          businessId,
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, name: true, phone: true, email: true },
        take: 5,
      }),
      prisma.lead.findMany({
        where: {
          tenantId,
          businessId,
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { contact: { name: { contains: q, mode: "insensitive" } } },
          ],
        },
        select: {
          id: true,
          title: true,
          stage: true,
          contact: { select: { name: true, phone: true } },
        },
        take: 5,
      }),
      prisma.conversation.findMany({
        where: {
          tenantId,
          businessId,
          OR: [
            { contact: { name: { contains: q, mode: "insensitive" } } },
            { contact: { phone: { contains: q, mode: "insensitive" } } },
            { lastMessagePreview: { contains: q, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          status: true,
          lastMessagePreview: true,
          contact: { select: { name: true, phone: true } },
        },
        take: 5,
      }),
      prisma.message.findMany({
        where: {
          tenantId,
          businessId,
          content: { contains: q, mode: "insensitive" },
        },
        select: { id: true, conversationId: true, content: true, createdAt: true, direction: true },
        take: 5,
      }),
      prisma.campaign.findMany({
        where: {
          tenantId,
          businessId,
          name: { contains: q, mode: "insensitive" },
        },
        select: { id: true, name: true, status: true },
        take: 5,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: { contacts, leads, conversations, messages, campaigns },
    });
  } catch (error) {
    console.error("[SEARCH]", error);
    return NextResponse.json({ success: false, error: "Failed to search" }, { status: 500 });
  }
}
