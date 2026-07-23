import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await prisma.contact.groupBy({
      by: ["source"],
      where: {
        tenantId: session.user.tenantId,
        isBlocked: false,
        source: { not: null },
      },
      orderBy: { source: "asc" },
      take: 100,
    });

    const sources = rows
      .map((row) => row.source?.trim())
      .filter((source): source is string => Boolean(source));

    return NextResponse.json({ success: true, data: sources });
  } catch (error) {
    console.error("[CONTACT SOURCES GET]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch contact sources" }, { status: 500 });
  }
}
