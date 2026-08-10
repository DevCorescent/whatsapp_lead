// ============================================================================
// OWNER  : Gauransh
// MODULE : Messages
// ROUTE  : /api/messages
//
// METHODS
// POST   - Send an agent-authored message to a contact, or record an internal note
//
// ACCESS
// POST   - Authenticated. Scoped to session.user.tenantId; a conversation belonging
//          to another workspace is indistinguishable from one that does not exist.
// ============================================================================
//
// This route is the outbound counterpart to the WhatsApp webhook: the webhook is the only producer
// of INBOUND messages, this is the only producer of agent-authored OUTBOUND ones. It handles TEXT
// only — media and template sends are separate concerns and are rejected here rather than silently
// coerced into something the caller did not ask for.

import { NextRequest, NextResponse } from "next/server";
import { MessageDirection, MessageStatus, MessageType } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import type { Contact, Conversation, Message } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pusher, tenantChannel, PusherEvent } from "@/lib/pusher";
import { sendTextMessage, sendInteractiveMessage } from "@/lib/whatsapp";
import { resolveWhatsAppCreds } from "@/lib/business";
import { sendMessageSchema } from "@/lib/validators/message";

/**
 * Longest snippet the inbox list renders per conversation before truncating.
 *
 * Mirrors the webhook's own limit: both writers feed the same `Conversation.lastMessagePreview`
 * column, and a preview truncated to two different lengths would make the list render
 * inconsistently depending on who spoke last.
 */
const PREVIEW_MAX_LENGTH = 120;

/** A conversation with the contact needed to address a WhatsApp message to. */
type ConversationWithContact = Conversation & { contact: Contact };

/**
 * Load the conversation and, in the same query, the contact it belongs to.
 *
 * The send path needs the contact's phone number, so joining it here rather than issuing a second
 * lookup keeps the whole resolution to one round trip.
 *
 * Scoping by `tenantId` is what makes this a lookup rather than a vulnerability: `conversationId`
 * is caller-supplied, and without the tenant predicate any authenticated user of any workspace
 * could address a message into any other workspace's thread. A conversation belonging to another
 * tenant must be indistinguishable from one that does not exist, which is why the miss is a plain
 * null rather than a distinct "forbidden" signal.
 */
async function resolveConversation(
  tenantId: string,
  conversationId: string
): Promise<ConversationWithContact | null> {
  return prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
    include: { contact: true },
  });
}

/**
 * Record an internal note.
 *
 * A note is a message in the schema but not a message on the wire: it is an agent writing to their
 * own team about a customer, and it must never reach WhatsApp. It is therefore stored with
 * `isNote: true` and no `waMessageId` — there is no Meta message to correlate it with, and leaving
 * that column null is what keeps delivery-receipt matching in the webhook from ever binding a
 * receipt to a note.
 *
 * The conversation's preview and `lastMessageAt` are deliberately *not* advanced. Those columns
 * describe the customer-facing thread; letting private commentary rewrite the inbox preview would
 * show agents a summary of a conversation the customer never had.
 *
 * Status is SENT rather than the schema's PENDING default. Delivery state describes a journey to
 * Meta that a note never takes — left PENDING it would sit in the inbox behind a permanent
 * "sending" indicator, waiting on a receipt that cannot arrive.
 *
 * A single create is atomic on its own; no transaction is needed precisely because nothing else is
 * being written alongside it.
 */
async function saveNote(
  tenantId: string,
  conversationId: string,
  sentById: string,
  content: string
): Promise<Message> {
  return prisma.message.create({
    data: {
      tenantId,
      conversationId,
      sentById,
      direction: MessageDirection.OUTBOUND,
      type: MessageType.TEXT,
      status: MessageStatus.SENT,
      isNote: true,
      content,
    },
  });
}

/**
 * Persist a message that WhatsApp has already accepted, and move the thread forward with it.
 *
 * The message row and the conversation's denormalised columns are one fact expressed in two tables,
 * so they commit together. The inbox list *sorts* on `lastMessageAt` and *renders*
 * `lastMessagePreview`; a message written without them would sit correctly in the database and be
 * invisible in the product, and a crash between two separate writes would leave the thread
 * permanently disagreeing with its own last message. The transaction boundary is drawn around
 * exactly those two writes and nothing else.
 *
 * The Meta call deliberately happens *outside* this transaction. Holding a database transaction
 * open across a network call to a third party would pin a connection for the duration of Meta's
 * latency — and on a Meta timeout, roll back a message the customer has already received.
 *
 * `unreadCount` is untouched: it counts what the *agent* has not read, and the agent's own
 * workspace authored this.
 *
 * Status is SENT because Meta has acknowledged the message by the time we are called. The webhook's
 * receipt handler remains the sole writer of everything after that — DELIVERED, READ, FAILED.
 */
async function saveOutboundMessage(
  tenantId: string,
  conversationId: string,
  sentById: string,
  content: string,
  waMessageId: string | null,
  opts?: {
    type?: MessageType;
    replyToId?: string;
    metadata?: Prisma.InputJsonObject;
  }
): Promise<Message> {
  const type = opts?.type ?? MessageType.TEXT;
  return prisma.$transaction(async (tx) => {
    const saved = await tx.message.create({
      data: {
        tenantId,
        conversationId,
        sentById,
        waMessageId,
        direction: MessageDirection.OUTBOUND,
        type,
        status: MessageStatus.SENT,
        content,
        ...(opts?.replyToId ? { replyToId: opts.replyToId } : {}),
        ...(opts?.metadata ? { metadata: opts.metadata } : {}),
      },
    });

    await tx.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: saved.createdAt,
        lastMessagePreview: content.slice(0, PREVIEW_MAX_LENGTH),
      },
    });

    return saved;
  });
}

/**
 * Push a persisted message to every agent watching this tenant's inbox.
 *
 * Realtime is a notification layer over a database that already holds the truth, so this never
 * throws: the sender already has the message in the HTTP response, and any other agent will see it
 * on their next fetch. Failing the request because a socket fan-out failed would report a send that
 * demonstrably succeeded as an error.
 *
 * It runs after the commit, never before — broadcasting a message that a rolled-back transaction
 * never persisted would put a phantom into every agent's inbox.
 */
async function broadcastMessage(
  tenantId: string,
  message: Message
): Promise<void> {
  if (!pusher) return;

  try {
    await pusher.trigger(
      tenantChannel(tenantId),
      PusherEvent.NEW_MESSAGE,
      message
    );
  } catch (error) {
    console.error(
      `[MESSAGES] Failed to broadcast message ${message.id} to tenant ${tenantId}:`,
      error
    );
  }
}

/**
 * Send an agent-authored message, or record an internal note.
 *
 * The handler orchestrates and does not decide: validation, resolution, persistence and fan-out
 * each live in a helper above, and the flow reads as the sequence of steps it is.
 *
 * Ordering is load-bearing on the send path. WhatsApp is called *before* the message is persisted,
 * because the only unrecoverable outcome is a message the customer received but we have no record
 * of. Persisting first and sending second would invert that: a Meta failure would leave the agent
 * looking at a message in their thread that never left the building.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { tenantId, id: userId } = session.user;

  try {
    const parsed = sendMessageSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { conversationId, type, content, isNote, interactive, replyToId } = parsed.data;

    // Notes are always TEXT — interactive notes make no sense and we don't send them to WhatsApp.
    const body = content?.trim();

    if (type === "TEXT" && !body) {
      return NextResponse.json(
        { success: false, error: "Message content is required" },
        { status: 400 }
      );
    }
    if (type === "INTERACTIVE" && !interactive) {
      return NextResponse.json(
        { success: false, error: "interactive payload is required for INTERACTIVE messages" },
        { status: 400 }
      );
    }
    if (!["TEXT", "INTERACTIVE"].includes(type)) {
      return NextResponse.json(
        { success: false, error: `Unsupported message type: ${type}` },
        { status: 400 }
      );
    }

    const conversation = await resolveConversation(tenantId, conversationId);
    if (!conversation) {
      return NextResponse.json(
        { success: false, error: "Conversation not found" },
        { status: 404 }
      );
    }

    if (isNote) {
      const note = await saveNote(tenantId, conversationId, userId, body ?? "");
      await broadcastMessage(tenantId, note);
      return NextResponse.json({ success: true, data: note }, { status: 201 });
    }

    const creds = await resolveWhatsAppCreds(conversation.businessId);
    if (!creds.phoneNumberId || !creds.apiKey) {
      return NextResponse.json(
        { success: false, error: "WhatsApp is not connected for this workspace" },
        { status: 409 }
      );
    }

    // Resolve the waMessageId of the quoted message so we can pass context to Meta.
    let contextWaMessageId: string | undefined;
    if (replyToId) {
      const quoted = await prisma.message.findFirst({
        where: { id: replyToId, tenantId },
        select: { waMessageId: true },
      });
      contextWaMessageId = quoted?.waMessageId ?? undefined;
    }

    let waMessageId: string | null = null;

    if (type === "INTERACTIVE" && interactive) {
      const sent = await sendInteractiveMessage(
        creds.phoneNumberId,
        creds.apiKey,
        conversation.contact.phone,
        interactive as Record<string, unknown>,
        contextWaMessageId
      );
      waMessageId = sent.messages?.[0]?.id ?? null;
      const interactiveBody = interactive.type === "button"
        ? interactive.body.text
        : interactive.body.text;
      const message = await saveOutboundMessage(
        tenantId, conversationId, userId, interactiveBody, waMessageId,
        { type: MessageType.INTERACTIVE, replyToId, metadata: { interactive } as Prisma.InputJsonObject }
      );
      await broadcastMessage(tenantId, message);
      return NextResponse.json({ success: true, data: message }, { status: 201 });
    }

    const sent = await sendTextMessage(
      creds.phoneNumberId,
      creds.apiKey,
      conversation.contact.phone,
      body!,
      contextWaMessageId
    );
    waMessageId = sent.messages?.[0]?.id ?? null;

    const message = await saveOutboundMessage(
      tenantId, conversationId, userId, body!, waMessageId,
      { replyToId }
    );

    await broadcastMessage(tenantId, message);

    return NextResponse.json({ success: true, data: message }, { status: 201 });
  } catch (error) {
    // Meta's client throws with the upstream response body embedded, which can carry account
    // identifiers and token hints — so it is logged in full and never returned to the caller.
    console.error("[MESSAGES]", error);

    return NextResponse.json(
      { success: false, error: "Failed to send message" },
      { status: 500 }
    );
  }
}
