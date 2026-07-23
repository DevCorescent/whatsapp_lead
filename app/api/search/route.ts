import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ success: true, data: { contacts: [], conversations: [], leads: [] } });
  }

  try {
    const [contacts, leads] = await Promise.all([
      prisma.contact.findMany({
        where: {
          tenantId,
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { email: { contains: q, mode: "insensitive" } },
            { company: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, name: true, phone: true, email: true, company: true, avatarUrl: true },
        take: 5,
      }),
      prisma.lead.findMany({
        where: {
          tenantId,
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { contact: { name: { contains: q, mode: "insensitive" } } },
          ],
        },
        select: {
          id: true,
          title: true,
          stage: { select: { id: true, name: true, color: true } },
          score: true,
          contact: { select: { id: true, name: true, phone: true } },
        },
        take: 5,
      }),
    ]);

    return NextResponse.json({ success: true, data: { contacts, leads } });
  } catch (error) {
    console.error("[SEARCH]", error);
    return NextResponse.json({ success: false, error: "Search failed" }, { status: 500 });
  }
}
