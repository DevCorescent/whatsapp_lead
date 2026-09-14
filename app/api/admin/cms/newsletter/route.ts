// ROUTE : /api/admin/cms/newsletter
//   GET — newsletter sign-up count and the most recent addresses. SUPER_ADMIN only.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  try {
    const [total, recent] = await Promise.all([
      prisma.newsletterSubscriber.count(),
      prisma.newsletterSubscriber.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, email: true, source: true, createdAt: true },
      }),
    ]);
    return NextResponse.json({ success: true, data: { total, recent } });
  } catch (error) {
    console.error("[NEWSLETTER] Failed to list subscribers:", error);
    return NextResponse.json({ success: false, error: "Could not load subscribers" }, { status: 500 });
  }
}
