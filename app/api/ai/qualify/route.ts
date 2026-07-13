import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { qualifyLead } from "@/lib/ai";
import { scoreLabelFor } from "@/lib/utils";

const schema = z.object({
  leadId: z.string().min(1, "leadId is required"),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, id: userId } = session.user;

  try {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    const { leadId } = parsed.data;

    // Get lead + contact + conversation messages
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, tenantId },
      include: {
        contact: {
          select: { id: true, name: true, phone: true },
          include: {
            conversations: {
              where: { tenantId },
              include: {
                messages: {
                  select: { direction: true, content: true, createdAt: true },
                  orderBy: { createdAt: "asc" },
                  take: 50,
                },
              },
              orderBy: { updatedAt: "desc" },
              take: 3,
            },
          },
        },
      },
    });

    if (!lead) return NextResponse.json({ success: false, error: "Lead not found" }, { status: 404 });

    // Build conversation transcript
    const messages: string[] = [];
    for (const conv of lead.contact.conversations) {
      for (const msg of conv.messages) {
        if (!msg.content) continue;
        const role = msg.direction === "INBOUND" ? "Customer" : "Agent";
        messages.push(`${role}: ${msg.content}`);
      }
    }

    if (messages.length === 0) {
      return NextResponse.json({ success: false, error: "No conversation messages to qualify from" }, { status: 400 });
    }

    const result = await qualifyLead(messages);
    const score = Math.min(100, Math.max(0, result.score));
    const scoreLabel = scoreLabelFor(score);

    const updated = await prisma.$transaction(async (tx) => {
      const updatedLead = await tx.lead.update({
        where: { id: leadId },
        data: {
          score,
          scoreLabel,
          ...(result.bantBudget && { budget: result.bantBudget }),
          ...(result.bantAuthority && { authority: result.bantAuthority }),
          ...(result.bantNeed && { requirement: result.bantNeed }),
          ...(result.bantTimeline && { timeline: result.bantTimeline }),
        },
        include: {
          contact: { select: { id: true, name: true } },
        },
      });

      await tx.leadActivity.create({
        data: {
          leadId,
          userId,
          type: "AI_QUALIFICATION",
          content: result.reasoning || `AI scored this lead ${score}/100 (${scoreLabel})`,
          metadata: {
            score,
            scoreLabel,
            bantBudget: result.bantBudget,
            bantAuthority: result.bantAuthority,
            bantNeed: result.bantNeed,
            bantTimeline: result.bantTimeline,
          },
        },
      });

      return updatedLead;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[AI QUALIFY]", error);
    return NextResponse.json({ success: false, error: "AI qualification failed" }, { status: 500 });
  }
}
