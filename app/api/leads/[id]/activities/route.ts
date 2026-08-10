import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createActivitySchema = z.object({
  type: z.enum(["NOTE", "CALL", "EMAIL", "MEETING"]),
  content: z.string().min(1).max(2000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { tenantId, id: userId } = session.user;

  try {
    const { id } = await params;
    let body: unknown;
    try { body = await req.json(); } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = createActivitySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const lead = await prisma.lead.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!lead) {
      return NextResponse.json({ success: false, error: "Lead not found" }, { status: 404 });
    }

    const activity = await prisma.leadActivity.create({
      data: {
        leadId: id,
        userId,
        type: parsed.data.type,
        content: parsed.data.content,
      },
      include: { user: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ success: true, data: activity }, { status: 201 });
  } catch (error) {
    console.error("[LEAD ACTIVITY POST]", error);
    return NextResponse.json({ success: false, error: "Failed to log activity" }, { status: 500 });
  }
}
