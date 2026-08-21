// ============================================================================
// MODULE : Send a FAQ list into a conversation
// ROUTE  : POST /api/knowledge/faqs/send
//
// ACCESS : Signed-in members of the tenant, scoped to the active business.
// ============================================================================
//
// Turns a curated FAQ collection into a WhatsApp interactive list. The customer
// taps a question, the answer you wrote comes straight back — no model call, no
// AI credit, no chance of an invented price — and the tap is recorded as intent.
//
// Gated on the send caps, not on AI: this reaches WhatsApp and costs a
// conversation, and it never touches a model.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MessageType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";
import { guardFeature, guardLimit } from "@/lib/billing/guard";
import { resolveWhatsAppCreds } from "@/lib/business";
import { sendInteractiveMessage } from "@/lib/whatsapp";
import { readFaqList, readFaqState } from "@/lib/knowledgeFaq";
import { buildFaqListPayload, WA_LIST_MAX_ROWS } from "@/lib/knowledgeFaqSend";
import { pusher, tenantChannel, PusherEvent } from "@/lib/pusher";

const schema = z.object({
  conversationId: z.string().min(1),
  kind: z.enum(["document", "set"]),
  sourceId: z.string().min(1),
  /** Optional lead-in above the list. */
  bodyText: z.string().trim().max(900).optional(),
});

export async function POST(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, businessId, userId } = scope;

  const noRag = await guardFeature(tenantId, "ragEnabled");
  if (noRag) return noRag;

  try {
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { conversationId, kind, sourceId, bodyText } = parsed.data;

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, tenantId, businessId },
      include: { contact: { select: { phone: true, optedOut: true } } },
    });
    if (!conversation) {
      return NextResponse.json({ success: false, error: "Conversation not found" }, { status: 404 });
    }
    if (conversation.contact.optedOut) {
      return NextResponse.json(
        { success: false, error: "This contact has opted out of messages." },
        { status: 409 },
      );
    }

    // Resolve the questions from whichever collection was named.
    let title: string;
    let faqs;
    if (kind === "document") {
      const doc = await prisma.knowledgeDoc.findFirst({
        where: { id: sourceId, tenantId, businessId },
        select: { name: true, metadata: true },
      });
      if (!doc) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
      title = doc.name;
      faqs = readFaqState(doc.metadata).faqs;
    } else {
      const set = await prisma.knowledgeFaqSet.findFirst({
        where: { id: sourceId, tenantId, businessId },
        select: { name: true, faqs: true },
      });
      if (!set) return NextResponse.json({ success: false, error: "FAQ set not found" }, { status: 404 });
      title = set.name;
      faqs = readFaqList(set.faqs);
    }

    const payload = buildFaqListPayload({ kind, sourceId, title, faqs, bodyText });
    if (payload.sent.length === 0) {
      return NextResponse.json(
        { success: false, error: "This list has no answered questions to send yet." },
        { status: 409 },
      );
    }

    for (const window of ["messagesPerHour", "messagesPerDay"] as const) {
      const overLimit = await guardLimit(tenantId, window);
      if (overLimit) return overLimit;
    }

    const creds = await resolveWhatsAppCreds(businessId);
    if (!creds.phoneNumberId || !creds.apiKey) {
      return NextResponse.json(
        { success: false, error: "WhatsApp is not connected for this workspace" },
        { status: 409 },
      );
    }

    const sent = await sendInteractiveMessage(
      creds.phoneNumberId,
      creds.apiKey,
      conversation.contact.phone,
      payload.interactive,
    );

    const message = await prisma.message.create({
      data: {
        tenantId,
        businessId,
        conversationId,
        sentById: userId,
        waMessageId: sent.messages?.[0]?.id ?? null,
        direction: "OUTBOUND",
        status: "SENT",
        type: MessageType.INTERACTIVE,
        content: `${title} — ${payload.sent.length} question${payload.sent.length === 1 ? "" : "s"}`,
        // The questions as sent are stored alongside the payload. A row id points
        // at an index, and the list can be edited afterwards — without this the
        // record of what was actually asked would drift from what was answered.
        metadata: {
          interactive: payload.interactive,
          faqMenu: { kind, sourceId, questions: payload.sent.map((f) => f.question) },
        } as Prisma.InputJsonObject,
      },
    });

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: message.createdAt, lastMessagePreview: message.content ?? "" },
    });

    // Best-effort fan-out to any agent with the inbox open. A realtime hiccup
    // must not fail a message that has already reached WhatsApp.
    if (pusher) {
      try {
        await pusher.trigger(tenantChannel(tenantId), PusherEvent.NEW_MESSAGE, message);
      } catch (error) {
        console.error("[FAQ SEND] broadcast failed:", error);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        message,
        sent: payload.sent.length,
        // Meta caps a list at ten rows; say so rather than silently sending nine
        // of a curated twelve.
        dropped: payload.dropped,
        maxRows: WA_LIST_MAX_ROWS,
      },
    });
  } catch (error) {
    console.error("[FAQ SEND]", error);
    return NextResponse.json({ success: false, error: "Failed to send the FAQ list" }, { status: 500 });
  }
}
