import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  aiEnabled: z.boolean().optional(),
  aiModel: z.string().optional(),
  autoReply: z.boolean().optional(),
  autoReplyDelay: z.number().min(0).max(60).optional(),
  aiPersonality: z.string().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  try {
    const settings = await prisma.tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId },
      update: {},
      select: {
        aiEnabled: true,
        aiModel: true,
        autoReply: true,
        autoReplyDelay: true,
        aiPersonality: true,
      },
    });

    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    console.error("[SETTINGS AI GET]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch AI settings" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, role } = session.user;

  if (!["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"].includes(role)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    const data = parsed.data;

    const settings = await prisma.tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
      select: {
        aiEnabled: true,
        aiModel: true,
        autoReply: true,
        autoReplyDelay: true,
        aiPersonality: true,
      },
    });

    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    console.error("[SETTINGS AI PATCH]", error);
    return NextResponse.json({ success: false, error: "Failed to update AI settings" }, { status: 500 });
  }
}
