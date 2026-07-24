import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  let dbStatus: "online" | "error" = "error";
  let dbLatencyMs = 0;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - t0;
    dbStatus = "online";
  } catch {
    dbLatencyMs = Date.now() - t0;
  }

  const apiLatencyMs = Date.now() - t0;

  const pusherConfigured = Boolean(
    process.env.PUSHER_APP_ID &&
      process.env.PUSHER_KEY &&
      process.env.PUSHER_SECRET &&
      process.env.PUSHER_CLUSTER
  );

  const waConfigured = Boolean(process.env.WHATSAPP_APP_SECRET);

  return NextResponse.json({
    success: true,
    data: {
      api: { latencyMs: apiLatencyMs, status: "healthy" },
      database: { latencyMs: dbLatencyMs, status: dbStatus },
      pusher: { configured: pusherConfigured, status: pusherConfigured ? "configured" : "unconfigured" },
      whatsapp: { configured: waConfigured, status: waConfigured ? "configured" : "unconfigured" },
      checkedAt: new Date().toISOString(),
    },
  });
}
