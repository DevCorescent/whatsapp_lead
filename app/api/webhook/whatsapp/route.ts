// ============================================================================
// OWNER  : Gauransh
// MODULE : WhatsApp Webhook
// ROUTE  : /api/webhook/whatsapp
//
// METHODS
// GET    - Meta subscription verification challenge (hub.challenge)
// POST   - Inbound messages and delivery receipts from the WhatsApp Cloud API
//
// ACCESS
// GET    - Public. Authenticated by WHATSAPP_VERIFY_TOKEN (hub.verify_token).
// POST   - Public. Authenticated by X-Hub-Signature-256 HMAC over the raw body,
//          keyed with WHATSAPP_APP_SECRET. Unsigned requests are refused with 403.
// ============================================================================
//
// The webhook is the only producer of inbound WhatsApp data in the system: every Contact,
// Conversation and inbound Message originates here. The ingestion order is fixed —
//
//   POST → processEntry → processChange → processIncomingMessage
//                                         → resolveTenant
//                                         → upsertContact
//                                         → findOrCreateConversation
//                                         → saveInboundMessage (+ conversation counters)
//                       → processStatusUpdate
//
// NOT YET IMPLEMENTED (deliberately, tracked elsewhere): chatbot flow execution, AI auto-reply
// (TenantSettings.aiEnabled / autoReply are read by nothing today), Pusher realtime events
// (lib/pusher.ts does not exist), and markMessageAsRead. See the review notes accompanying this
// module — none of these have their dependencies installed.

import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  ConversationStatus,
  MessageDirection,
  MessageStatus,
  MessageType,
  Prisma,
} from "@prisma/client";
import type { Contact, Conversation, Message } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateReply } from "@/lib/ai";
import { pusher, tenantChannel, PusherEvent } from "@/lib/pusher";
import { markMessageAsRead, sendTextMessage } from "@/lib/whatsapp";
import type {
  WAChange,
  WAEntry,
  WAMessage,
  WAStatus,
  WAWebhookPayload,
} from "@/types";

/**
 * The only `object` value this endpoint is subscribed to.
 *
 * A Meta app can be subscribed to several product webhooks that all POST to the same URL, so the
 * discriminator is checked rather than assumed — a payload for another product is not an error,
 * it simply is not ours to process.
 */
const WA_WEBHOOK_OBJECT = "whatsapp_business_account";

/** Header Meta signs every webhook POST with, and the algorithm prefix its value carries. */
const SIGNATURE_HEADER = "x-hub-signature-256";
const SIGNATURE_PREFIX = "sha256=";

/**
 * Verify that a webhook POST genuinely originated from Meta.
 *
 * This endpoint is unauthenticated by necessity — Meta cannot present a session — so the HMAC is
 * the only thing distinguishing a real delivery from a forged one. Without it, anyone who learns
 * a tenant's `phone_number_id` can inject arbitrary contacts, conversations and messages into
 * that workspace, and trigger whatever automation those messages fire. The signature check is
 * therefore the authentication boundary of the entire inbound pipeline, and it must run before
 * the body is interpreted, not after.
 *
 * The digest is computed over the exact bytes Meta signed. Re-serialising a parsed object would
 * not reproduce them — key order, whitespace and unicode escaping are all free to differ — so the
 * caller passes the raw body string and parses only once this returns true.
 *
 * A missing app secret fails closed. A deployment that has not been configured is
 * indistinguishable from an attacker to this function, and silently accepting everything would be
 * the worst possible reading of an absent environment variable.
 *
 * @param rawBody - The unparsed request body, exactly as received.
 * @param signatureHeader - Value of `X-Hub-Signature-256`, or null when absent.
 * @returns True only if the header is present, well-formed, and matches the computed digest.
 */
function verifySignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (!appSecret) {
    console.error(
      "[WEBHOOK] WHATSAPP_APP_SECRET is not configured — rejecting request"
    );
    return false;
  }

  if (!signatureHeader?.startsWith(SIGNATURE_PREFIX)) return false;

  const received = Buffer.from(
    signatureHeader.slice(SIGNATURE_PREFIX.length),
    "hex"
  );
  const expected = createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest();

  // timingSafeEqual throws on a length mismatch rather than returning false, and a malformed
  // hex digest decodes to a short buffer — so the lengths are reconciled before comparing.
  if (received.length !== expected.length) return false;

  return timingSafeEqual(received, expected);
}

/**
 * Meta's `message.type` discriminator mapped onto the schema's `MessageType` enum.
 *
 * Meta's vocabulary and ours are deliberately not identical: a tap on a template quick-reply
 * arrives as `button` but is, to the CRM, just another interactive response, so both collapse
 * onto INTERACTIVE. Types Meta may add in future (or that we have not enabled) are absent here
 * on purpose — the lookup falls back to TEXT so an unrecognised payload is still persisted and
 * visible to an agent rather than silently dropped.
 */
const META_TO_MESSAGE_TYPE: Record<string, MessageType> = {
  text: MessageType.TEXT,
  image: MessageType.IMAGE,
  video: MessageType.VIDEO,
  audio: MessageType.AUDIO,
  document: MessageType.DOCUMENT,
  location: MessageType.LOCATION,
  sticker: MessageType.STICKER,
  interactive: MessageType.INTERACTIVE,
  button: MessageType.INTERACTIVE,
};

/**
 * Meta's delivery-receipt vocabulary mapped onto the schema's `MessageStatus` enum.
 *
 * Meta emits exactly these four values for outbound messages, so the map is total and needs no
 * fallback — an unrecognised value would mean Meta changed its contract, which should surface
 * as a type error here rather than be silently coerced into a wrong status.
 *
 * PENDING has no Meta counterpart by design: it is the local state a message occupies between
 * our own write and Meta's first receipt, so it is never something Meta tells us about.
 */
const META_TO_MESSAGE_STATUS: Record<WAStatus["status"], MessageStatus> = {
  sent: MessageStatus.SENT,
  delivered: MessageStatus.DELIVERED,
  read: MessageStatus.READ,
  failed: MessageStatus.FAILED,
};

/**
 * Delivery state as a monotonic ladder.
 *
 * Meta does not order its receipts: a `delivered` callback can land after the `read` callback for
 * the same message. Applying receipts blindly would let a message visibly regress from "read" back
 * to "delivered" in the agent's inbox. Ranking them makes the update idempotent under reordering —
 * replaying the same receipts in any order converges on the same state. FAILED sits at the top
 * because a message that failed did not subsequently succeed.
 */
const STATUS_RANK: Record<MessageStatus, number> = {
  [MessageStatus.PENDING]: 0,
  [MessageStatus.SENT]: 1,
  [MessageStatus.DELIVERED]: 2,
  [MessageStatus.READ]: 3,
  [MessageStatus.FAILED]: 4,
};

/**
 * TenantSettings with its parent Tenant eagerly loaded.
 *
 * Callers need both halves on every inbound event — the settings carry the WhatsApp
 * credentials and AI flags, while the tenant carries `isActive` and the `tenantId` that
 * scopes every downstream write — so they are resolved together in a single round trip.
 */
export type ResolvedTenant = Prisma.TenantSettingsGetPayload<{
  include: { tenant: true };
}>;

/**
 * Resolve the owning tenant for an inbound WhatsApp event.
 *
 * Meta identifies the receiving business number by `metadata.phone_number_id`, which is the
 * only tenant discriminator present on a webhook payload. This lookup is therefore the point
 * at which an untrusted, unauthenticated request is bound to exactly one tenant — every
 * subsequent query in the request depends on the `tenantId` established here, so failing loudly
 * is preferable to processing an event we cannot attribute.
 *
 * Note: `waPhoneNumberId` is nullable and carries no unique constraint in the schema, so this
 * is a `findFirst` rather than a `findUnique`. A duplicated number across two tenants would
 * silently route traffic to whichever row is returned first; that is a data-integrity problem
 * to be enforced at provisioning time, not something this helper can detect.
 *
 * @param phoneNumberId - Meta's `value.metadata.phone_number_id` for the receiving number.
 * @returns The tenant's settings with the parent tenant included.
 * @throws {Error} If no tenant has this number configured, or the resolved tenant is inactive.
 */
async function resolveTenant(phoneNumberId: string): Promise<ResolvedTenant> {
  const settings = await prisma.tenantSettings.findFirst({
    where: { waPhoneNumberId: phoneNumberId },
    include: { tenant: true },
  });

  if (!settings) {
    throw new Error(
      `No tenant configured for WhatsApp phone_number_id "${phoneNumberId}"`
    );
  }

  // A suspended or deleted workspace must not accumulate new conversations, contacts or
  // AI spend, even though Meta will keep delivering to a number that is still subscribed.
  if (!settings.tenant.isActive) {
    throw new Error(
      `Tenant inactive: "${settings.tenant.slug}" (${settings.tenantId})`
    );
  }

  return settings;
}

/**
 * Resolve the WhatsApp sender to a Contact row, creating it on first contact.
 *
 * The webhook is the only inbound producer in the system, so an unknown sender must become a
 * Contact here or the conversation it belongs to has nothing to hang off. This is expressed as
 * a single `upsert` against the `@@unique([phone, tenantId])` constraint rather than a
 * find-then-create pair: Meta delivers concurrently and retries aggressively, and a
 * read-then-write would race two deliveries into duplicate contacts for the same number.
 * Uniqueness is enforced by the database, not by application timing.
 *
 * The name is only written when Meta actually supplies a WhatsApp profile name. A blank or
 * absent name must never overwrite an existing one — agents curate contact names in the CRM,
 * and a subsequent inbound message from a contact with no public profile name would otherwise
 * silently erase that work.
 *
 * @param tenantId - Owning tenant, from the already-resolved TenantSettings.
 * @param phone - Sender's number as delivered by Meta (`WAMessage.from`, E.164 without "+").
 * @param name - WhatsApp profile name, when the payload carries one.
 * @returns The existing or newly created Contact.
 */
async function upsertContact(
  tenantId: string,
  phone: string,
  name?: string
): Promise<Contact> {
  const profileName = name?.trim();

  return prisma.contact.upsert({
    where: { phone_tenantId: { phone, tenantId } },
    // Omitting `name` entirely leaves the stored value untouched; Prisma maintains
    // `updatedAt` on its own via the schema's `@updatedAt` attribute.
    update: profileName ? { name: profileName } : {},
    // A contact with no profile name is still addressable by number, so the phone
    // doubles as the display name until an agent or a later payload supplies a better one.
    create: { tenantId, phone, name: profileName || phone },
  });
}

/**
 * Resolve the conversation an inbound message belongs to, opening one on first contact.
 *
 * A contact's messages must land in a single thread rather than fragmenting into a new
 * conversation per delivery, so an existing thread is always reused when one is present.
 * Ordering by `createdAt` desc makes the choice deterministic in the event that historical
 * data already holds more than one row for the pair — the newest thread wins.
 *
 * Only `tenantId` and `contactId` are supplied on create. Every other column the inbox relies
 * on is defaulted by the schema (`status` → OPEN, `channel` → WHATSAPP, `unreadCount` → 0);
 * restating them here would duplicate the schema's intent in application code and drift from it.
 * `lastMessageAt` and `lastMessagePreview` stay null until a message is actually persisted —
 * that is the message writer's responsibility, not this helper's.
 *
 * Caveat: `Conversation` carries no unique constraint on `(tenantId, contactId)`, so this
 * cannot be expressed as an `upsert` the way `upsertContact` can. Two Meta deliveries racing
 * for a brand-new contact can therefore both miss the read and both create a thread. The
 * schema is the only place that could close this, and changing it is out of scope.
 *
 * @param tenantId - Owning tenant, from the already-resolved TenantSettings.
 * @param contactId - Contact resolved by `upsertContact`.
 * @returns The existing or newly created Conversation.
 */
async function findOrCreateConversation(
  tenantId: string,
  contactId: string
): Promise<Conversation> {
  const existing = await prisma.conversation.findFirst({
    where: { tenantId, contactId },
    orderBy: { createdAt: "desc" },
  });

  if (existing) return existing;

  return prisma.conversation.create({
    data: { tenantId, contactId },
  });
}

/** Longest snippet the inbox list renders per conversation before truncating. */
const PREVIEW_MAX_LENGTH = 120;

/** How much of a thread the model is given as context before it drafts a reply. */
const AI_HISTORY_LIMIT = 10;

/**
 * Fallback persona when a tenant has configured none.
 *
 * `TenantSettings.aiPersonality` is nullable, and an empty system prompt makes the model behave
 * like a generic assistant — volunteering opinions, inventing policy, answering questions the
 * business never authorised it to answer. A conservative default is safer than no default.
 */
const DEFAULT_AI_PERSONALITY =
  "You are a helpful WhatsApp support agent for this business. Reply briefly and politely. " +
  "If you do not know something, say so and offer to connect the customer with a human agent.";

/**
 * The outcome of persisting an inbound message.
 *
 * `isNew` distinguishes a first delivery from a Meta retry. Every reaction downstream of ingestion
 * keys off it — see `saveInboundMessage` for why conflating the two would send duplicate AI replies.
 */
export interface SavedInboundMessage {
  message: Message;
  isNew: boolean;
}

/**
 * Decide whether an inbound message should reopen a dormant thread.
 *
 * A customer writing back to a RESOLVED or CLOSED conversation is reopening it. Left as-is, their
 * message would land in a thread the inbox's default filter excludes — captured by the database
 * and never seen by an agent, which is worse than dropping it because the system looks healthy.
 *
 * Reopening in place is preferred over starting a second thread: `Conversation` has no unique
 * constraint on `(tenantId, contactId)`, so a new-thread-per-reply policy would both fragment the
 * contact's history and stay exposed to the duplicate-thread race. ASSIGNED threads are left alone
 * — they are already someone's active work.
 *
 * Returns a partial update so the caller can spread it into the write it is already making, rather
 * than issuing a second one.
 */
async function resolveReopen(
  tx: Prisma.TransactionClient,
  conversationId: string
): Promise<{ status?: ConversationStatus }> {
  const conversation = await tx.conversation.findUnique({
    where: { id: conversationId },
    select: { status: true },
  });

  const isDormant =
    conversation?.status === ConversationStatus.RESOLVED ||
    conversation?.status === ConversationStatus.CLOSED;

  return isDormant ? { status: ConversationStatus.OPEN } : {};
}

/**
 * Extract the human-readable text of an inbound message.
 *
 * Every Meta message type stows its text somewhere different, and media without a caption has no
 * text at all — a null here is a legitimate outcome, not a parse failure.
 */
function extractContent(message: WAMessage): string | null {
  return (
    message.text?.body ??
    message.image?.caption ??
    message.document?.filename ??
    message.button?.text ??
    message.interactive?.button_reply?.title ??
    message.interactive?.list_reply?.title ??
    (message.location
      ? `${message.location.latitude}, ${message.location.longitude}`
      : null)
  );
}

/**
 * Resolve the instant the customer sent a message, from Meta's Unix-seconds string.
 *
 * The sender's clock, not ours, defines where a message belongs in the thread — a delivery
 * retried hours later must not jump to the top. A malformed timestamp falls back to receipt time:
 * note that `Number("")` is 0, which is finite, so an empty value would otherwise date the message
 * to 1970 and bury it at the bottom of the conversation forever.
 */
function extractTimestamp(message: WAMessage): Date {
  const epochSeconds = Number(message.timestamp);
  return Number.isFinite(epochSeconds) && epochSeconds > 0
    ? new Date(epochSeconds * 1000)
    : new Date();
}

/**
 * Persist a single inbound WhatsApp message and bring its conversation up to date, atomically.
 *
 * The message row and the thread's denormalised columns (`lastMessageAt`, `lastMessagePreview`,
 * `unreadCount`) are one fact expressed in two tables, so they commit together. Written
 * separately, a crash between them would leave the inbox permanently disagreeing with its own
 * messages — and because the inbox list *sorts* on `lastMessageAt` and *renders*
 * `lastMessagePreview`, a message whose conversation was not updated is invisible to agents even
 * though it sits correctly in the database.
 *
 * Idempotency is delegated to the `waMessageId @unique` constraint rather than a pre-flight read.
 * Meta retries aggressively and delivers concurrently, so a read-then-write would let two copies of
 * the same delivery both pass the check; the unique index cannot be raced. Critically, the counter
 * increments live on the *create* path only — the earlier `upsert` shape could not distinguish
 * "created" from "already existed", so incrementing `unreadCount` there would have inflated the
 * badge on every Meta retry.
 *
 * Media is recorded as far as the schema allows: `mediaType` and `mediaMimeType` are columns, but
 * there is no column for Meta's media ID, so the raw payload is preserved in `metadata` (a Json
 * column) and the ID read back from there when the asset is later fetched. `mediaUrl` is
 * deliberately left null — Meta hands out only an ID here, and the download URL it maps to expires
 * in minutes, so writing one would store a link that is dead by the time anyone clicks it.
 *
 * The `isNew` flag on the result exists because the reactions that follow a message — read receipt,
 * realtime broadcast, AI auto-reply — must fire exactly once. Persisting is idempotent; *sending an
 * AI reply is not*. Without this flag a Meta redelivery would generate and send a second reply to
 * the customer, at real cost, every time.
 *
 * @param tenantId - Owning tenant, from the already-resolved TenantSettings.
 * @param conversationId - Thread resolved by `findOrCreateConversation`.
 * @param message - The raw inbound message as delivered by Meta.
 * @returns The persisted Message, plus whether this delivery created it or was a retry.
 */
async function saveInboundMessage(
  tenantId: string,
  conversationId: string,
  message: WAMessage
): Promise<SavedInboundMessage> {
  const media =
    message.image ?? message.video ?? message.audio ?? message.document;
  const content = extractContent(message);

  // Media with no caption still needs something in the inbox list, or the row renders empty.
  const preview = (content ?? `[${message.type}]`).slice(0, PREVIEW_MAX_LENGTH);

  try {
    const created = await prisma.$transaction(async (tx) => {
      const saved = await tx.message.create({
        data: {
          tenantId,
          conversationId,
          waMessageId: message.id,
          direction: MessageDirection.INBOUND,
          // Arrival at our webhook is itself proof of delivery; Meta sends no separate
          // "delivered" status for messages inbound to the business.
          status: MessageStatus.DELIVERED,
          type: META_TO_MESSAGE_TYPE[message.type] ?? MessageType.TEXT,
          content,
          mediaType: media ? message.type : null,
          mediaMimeType: media?.mime_type ?? null,
          metadata: message as unknown as Prisma.InputJsonObject,
          createdAt: extractTimestamp(message),
        },
      });

      const reopen = await resolveReopen(tx, conversationId);

      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: saved.createdAt,
          lastMessagePreview: preview,
          unreadCount: { increment: 1 },
          ...reopen,
        },
      });

      return saved;
    });

    return { message: created, isNew: true };
  } catch (error) {
    // P2002 on waMessageId means Meta redelivered a message we have already ingested. The
    // conversation counters already account for it, so the correct response is to hand back the
    // stored row and increment nothing. This is what makes retries free rather than corrupting.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.message.findUnique({
        where: { waMessageId: message.id },
      });
      if (existing) return { message: existing, isNew: false };
    }

    throw error;
  }
}

/**
 * Show the customer a blue tick for a message we have durably stored.
 *
 * Called only after the message is committed, never before: a read receipt is a promise to the
 * customer that their message reached a human's inbox, and promising that ahead of the write would
 * make it a lie whenever the write fails.
 *
 * Meta's read-receipt endpoint is cosmetic to us and fallible on their side, so a failure here is
 * logged and swallowed. Nothing downstream depends on it, and no customer message should be lost
 * because a tick did not turn blue.
 */
async function markInboundAsRead(
  tenant: ResolvedTenant,
  waMessageId: string
): Promise<void> {
  if (!tenant.waPhoneNumberId || !tenant.waApiKey) return;

  try {
    await markMessageAsRead(
      tenant.waPhoneNumberId,
      tenant.waApiKey,
      waMessageId
    );
  } catch (error) {
    console.error(
      `[WEBHOOK] Failed to mark message ${waMessageId} as read:`,
      error
    );
  }
}

/**
 * Push a persisted message to every agent watching this tenant's inbox.
 *
 * Realtime is a notification layer over a database that already holds the truth, so this never
 * throws: an agent whose socket missed a broadcast still sees the message on their next fetch. A
 * Pusher outage must not cost us a customer's message, which is why the broadcast happens *after*
 * the commit and its failure is contained here.
 *
 * Used for both directions — the inbox renders an inbound message and our own AI reply through the
 * same subscription, so both travel on the same channel and event.
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
      `[WEBHOOK] Failed to broadcast message ${message.id} to tenant ${tenantId}:`,
      error
    );
  }
}

/**
 * Load the tail of a conversation as chat turns the model can reason over.
 *
 * Read back in `createdAt` descending order — which is the direction the `(conversationId,
 * createdAt)` index is walked, so the newest turns are found without scanning the thread — then
 * reversed, because a model needs the conversation in the order it happened.
 *
 * Internal notes are excluded: they are agents talking to each other about the customer, not to the
 * customer. Feeding them to the model would let private commentary leak into a reply. Messages with
 * no textual content (a bare image, a location pin) are excluded for the same reason they have no
 * preview — there is nothing to say about them.
 */
async function loadConversationHistory(
  tenantId: string,
  conversationId: string
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const messages: { direction: MessageDirection; content: string | null }[] =
    await prisma.message.findMany({
      where: {
        tenantId,
        conversationId,
        isNote: false,
        content: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: AI_HISTORY_LIMIT,
      select: { direction: true, content: true },
    });

  return messages
    .reverse()
    .map(({ direction, content }) => ({
      role:
        direction === MessageDirection.INBOUND
          ? ("user" as const)
          : ("assistant" as const),
      // Narrowed by the `content: { not: null }` filter above; the cast keeps the map total.
      content: content as string,
    }));
}

/**
 * Persist a message we sent, and move the thread's preview forward.
 *
 * Written with the same transactional guarantee as an inbound message: the row and the thread's
 * denormalised columns are one fact, and an inbox whose preview disagrees with its own last message
 * is worse than one that is merely stale.
 *
 * `unreadCount` is deliberately not touched. Unread counts what the *agent* has not seen, and the
 * agent's own workspace is what sent this — incrementing it would badge the inbox for a reply the
 * business itself authored.
 *
 * Status is PENDING rather than SENT even though Meta has already accepted the message. Meta will
 * confirm with a `sent` receipt within moments, and letting that receipt do the promotion keeps the
 * status ladder in `processStatusUpdate` as the single writer of delivery state.
 */
async function saveOutboundMessage(
  tenantId: string,
  conversationId: string,
  content: string,
  waMessageId: string | null
): Promise<Message> {
  return prisma.$transaction(async (tx) => {
    const saved = await tx.message.create({
      data: {
        tenantId,
        conversationId,
        waMessageId,
        direction: MessageDirection.OUTBOUND,
        status: MessageStatus.PENDING,
        type: MessageType.TEXT,
        content,
        isAiGenerated: true,
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
 * Draft and send an AI reply to an inbound message, when the tenant has asked us to.
 *
 * Gated on `aiEnabled` *and* `autoReply`. `aiEnabled` is the workspace's master switch: a tenant who
 * has turned AI off must not have models invoked on their behalf — nor be billed for the tokens —
 * merely because a second flag was left on. The two are independent columns, so both are checked.
 *
 * Every external dependency is isolated. A model outage, a Meta rejection or a Pusher failure each
 * degrade this to "no auto-reply was sent", which is a recoverable state an agent can pick up; none
 * of them may cost us the customer's message, which is already committed by the time we get here.
 * The database write is the one exception and is allowed to propagate: a message accepted by Meta
 * but absent from our records is a real inconsistency, and it should be loud.
 *
 * The conversation and contact are passed in already loaded. Re-fetching them here would issue two
 * more queries for rows the caller is holding.
 */
async function handleAutoReply(
  tenant: ResolvedTenant,
  conversation: Conversation,
  contact: Contact
): Promise<void> {
  if (!tenant.aiEnabled || !tenant.autoReply) return;

  if (!tenant.waPhoneNumberId || !tenant.waApiKey) {
    console.warn(
      `[WEBHOOK] Auto-reply enabled for tenant ${tenant.tenantId} but WhatsApp credentials are missing`
    );
    return;
  }

  const history = await loadConversationHistory(
    tenant.tenantId,
    conversation.id
  );

  // Nothing to reply to — a thread whose only messages are media or notes gives the model no turn.
  if (!history.length) return;

  let reply: string;
  try {
    reply = (
      await generateReply(
        history,
        tenant.aiPersonality?.trim() || DEFAULT_AI_PERSONALITY
      )
    ).trim();
  } catch (error) {
    console.error(
      `[WEBHOOK] AI reply generation failed for conversation ${conversation.id}:`,
      error
    );
    return;
  }

  // An empty completion is the model declining to answer, not an error. Sending a blank WhatsApp
  // message would be rejected by Meta anyway, and a whitespace-only one is worse: it looks like the
  // business replied with nothing.
  if (!reply) return;

  let waMessageId: string | null;
  try {
    const sent = await sendTextMessage(
      tenant.waPhoneNumberId,
      tenant.waApiKey,
      contact.phone,
      reply
    );
    waMessageId = sent.messages?.[0]?.id ?? null;
  } catch (error) {
    console.error(
      `[WEBHOOK] Failed to send AI reply to ${contact.phone}:`,
      error
    );
    // Nothing left the building, so there is nothing to record. Persisting an unsent reply would
    // show the agent a message the customer never received.
    return;
  }

  const outbound = await saveOutboundMessage(
    tenant.tenantId,
    conversation.id,
    reply,
    waMessageId
  );

  await broadcastMessage(tenant.tenantId, outbound);
}

/**
 * Apply a Meta delivery receipt (sent / delivered / read / failed) to the message it refers to.
 *
 * Status callbacks are advisory: Meta emits them on its own schedule and they can arrive before
 * our own write of the outbound message has committed, or for a message this tenant never sent.
 * A miss is therefore a normal, expected outcome rather than an error — the caller receives null
 * and moves on, and the next receipt for the same message will land once the row exists.
 *
 * `waMessageId` is unique, so the row is fetched with `findUnique`. Tenant ownership is then
 * asserted in memory rather than folded into the `where`: a globally unique key *identifies* a row,
 * it does not *authorise* access to it. On an unauthenticated endpoint the two must stay distinct,
 * so a receipt naming another workspace's message is refused rather than silently applied.
 *
 * Receipts are also applied monotonically (see STATUS_RANK) so that Meta's unordered callbacks
 * cannot walk a message backwards from READ to DELIVERED.
 *
 * Only `status` is written. A receipt says nothing about the thread, the contact, or the campaign
 * the message belonged to, so nothing else is touched — aggregate counters are the concern of
 * whichever module owns them, not of a status callback.
 *
 * @param tenantId - Owning tenant, from the already-resolved TenantSettings.
 * @param status - The raw status receipt as delivered by Meta.
 * @returns The updated Message, or null if the receipt was unknown, foreign, or stale.
 */
async function processStatusUpdate(
  tenantId: string,
  status: WAStatus
): Promise<Message | null> {
  const message = await prisma.message.findUnique({
    where: { waMessageId: status.id },
    select: { id: true, tenantId: true, status: true },
  });

  // Receipts routinely arrive for messages we have not written yet, or never sent at all.
  if (!message) return null;

  if (message.tenantId !== tenantId) {
    console.warn(
      `[WEBHOOK] Status receipt ${status.id} does not belong to tenant ${tenantId} — ignoring`
    );
    return null;
  }

  const incoming = META_TO_MESSAGE_STATUS[status.status];

  // A stale or replayed receipt is a no-op, not an error.
  if (STATUS_RANK[incoming] <= STATUS_RANK[message.status]) return null;

  return prisma.message.update({
    where: { id: message.id },
    data: { status: incoming },
  });
}

/**
 * Everything an inbound message resolves to, handed back to the caller in one piece.
 *
 * Downstream concerns the webhook still has to attend to — updating the thread's preview and
 * unread count, emitting the realtime event, deciding whether to auto-reply — each need some
 * subset of these four. Returning them together means none of those steps has to re-query for
 * state this function has already established.
 */
export interface InboundMessageResult {
  tenant: ResolvedTenant;
  contact: Contact;
  conversation: Conversation;
  message: Message;
}

/**
 * Resolve and persist one inbound WhatsApp message, end to end.
 *
 * This is the ingestion spine: tenant → contact → conversation → message. Each step depends on
 * the identity the previous one established, so they are necessarily sequential rather than
 * concurrent — there is no contact to hang a conversation off until the contact exists, and no
 * conversation to hang a message off until the conversation does.
 *
 * Ingestion is strictly separated from the reactions that follow it. Persisting the customer's
 * message is the one step that must not fail; marking it read, broadcasting it and answering it are
 * three steps that may. Ordering the durable write first, and containing each reaction's failure
 * inside its own helper, is what keeps a Meta outage or a model outage from costing us a message.
 *
 * The reactions fire only when the message is new. Persisting is idempotent, but *sending* is not:
 * Meta redelivers aggressively, and re-running this block on a retry would put a second AI reply in
 * front of the customer and bill us for it. `isNew` is the guard that makes retries free.
 *
 * The tenant is passed in already resolved rather than looked up from a phone number id. Every
 * message in a webhook change belongs to the same business number by construction, so resolving it
 * per message would issue one redundant TenantSettings query per message in a batch.
 *
 * @param tenant - Tenant already resolved by the caller for this change.
 * @param message - The raw inbound message as delivered by Meta.
 * @param contactName - WhatsApp profile name from `value.contacts[]`, when the payload carries one.
 * @returns The resolved tenant, contact, conversation and the persisted message.
 */
async function processIncomingMessage(
  tenant: ResolvedTenant,
  message: WAMessage,
  contactName?: string
): Promise<InboundMessageResult> {
  const contact = await upsertContact(
    tenant.tenantId,
    message.from,
    contactName
  );

  const conversation = await findOrCreateConversation(
    tenant.tenantId,
    contact.id
  );

  const { message: saved, isNew } = await saveInboundMessage(
    tenant.tenantId,
    conversation.id,
    message
  );

  if (isNew) {
    await markInboundAsRead(tenant, message.id);
    await broadcastMessage(tenant.tenantId, saved);
    await handleAutoReply(tenant, conversation, contact);
  }

  return { tenant, contact, conversation, message: saved };
}

/**
 * Dispatch one `change` from a webhook payload to the right ingestion path.
 *
 * A change carries either inbound messages or delivery receipts — never both — so the two
 * branches are mutually exclusive in practice, but both are checked rather than assumed: Meta's
 * envelope permits either key to be absent, and a change with neither (a field update we do not
 * subscribe to) is a legitimate no-op rather than an error.
 *
 * Both branches iterate sequentially rather than with `Promise.all`. Messages in a single change
 * usually share a sender, so processing them concurrently would race several deliveries into
 * `findOrCreateConversation` at once — which, lacking a unique constraint on
 * `(tenantId, contactId)`, is exactly the shape that produces duplicate threads. Ordering also
 * matters for the receiver: a thread should read in the order the customer sent it.
 *
 * Every event in a change belongs to the same business number by construction, so the tenant is
 * resolved once for the whole batch and threaded through both branches.
 *
 * @param change - One entry from `entry[].changes[]` of a Meta webhook payload.
 * @throws {Error} Propagated from `resolveTenant` when the number maps to no active tenant.
 *   Callers are expected to contain this: Meta must still receive a 200.
 */
async function processChange(change: WAChange): Promise<void> {
  const { metadata, contacts, messages, statuses } = change.value;

  // Nothing actionable in this change — a field update we do not subscribe to.
  if (!messages?.length && !statuses?.length) return;

  const tenant = await resolveTenant(metadata.phone_number_id);

  for (const message of messages ?? []) {
    // Match each sender to their own profile entry. Meta can batch messages from several contacts
    // into one change, in which case taking contacts[0] would file every message under the first
    // sender's name — creating the second contact with the wrong person's name entirely.
    const profile = contacts?.find((contact) => contact.wa_id === message.from);

    await processIncomingMessage(tenant, message, profile?.profile?.name);
  }

  for (const status of statuses ?? []) {
    await processStatusUpdate(tenant.tenantId, status);
  }
}

/**
 * Fan one webhook `entry` out across the changes it carries.
 *
 * Meta groups changes under an entry per WhatsApp Business Account, and a single delivery can
 * batch several. This layer exists purely to unwrap that nesting: it holds no logic of its own,
 * so that the payload's shape (`entry[] → changes[]`) and the work done per change stay
 * independent concerns.
 *
 * Changes are awaited one at a time rather than with `Promise.all`. A batch can hold successive
 * events for the same conversation — a message and the receipt for the reply that preceded it —
 * and running them concurrently would let the second commit before the first, reordering a
 * thread that the customer experienced in sequence.
 *
 * @param entry - One entry from `entry[]` of a Meta webhook payload.
 * @throws {Error} Propagated from `processChange` when a change cannot be attributed to an
 *   active tenant. Callers are expected to contain this: Meta must still receive a 200.
 */
async function processEntry(entry: WAEntry): Promise<void> {
  for (const change of entry.changes) {
    await processChange(change);
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("[WEBHOOK] Verified successfully");
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * Receive inbound messages and delivery receipts from the WhatsApp Cloud API.
 *
 * This handler acknowledges unconditionally. Meta treats any non-2xx — including one caused by
 * our own bug — as a failed delivery, retries it with backoff, and after sustained failures
 * disables the subscription for the business account entirely. A 200 here therefore means
 * "received", not "processed successfully"; the two must not be conflated, because letting a
 * malformed payload or a transient database error surface as a 500 would put the tenant's entire
 * WhatsApp integration at risk over a single bad event.
 *
 * Errors are contained at two levels. The outer boundary catches a malformed body or any failure
 * the per-entry guard did not. The inner one isolates each entry, so that a payload batching
 * events for several business accounts does not lose the rest when one tenant's processing fails
 * — the alternative would silently discard other tenants' customer messages.
 *
 * All work happens before the response is returned. The ingestion chain is a handful of indexed
 * queries per message and comfortably fits inside Meta's timeout at this volume; moving it off
 * the request path is a change to make when that stops being true, and it needs a durable queue
 * to be worth doing, since fire-and-forget work in a serverless function is not guaranteed to run.
 *
 * The unconditional 200 applies only to payloads that have already proved they came from Meta. An
 * unsigned or wrongly-signed request is not a delivery to acknowledge — it is an unauthenticated
 * write attempt — so it is refused with a 403 and never reaches the pipeline.
 *
 * @param req - The Meta webhook POST, authenticated by its `X-Hub-Signature-256` HMAC.
 * @returns HTTP 200 with `{ success: true }` for any authentic payload; HTTP 403 otherwise.
 */
export async function POST(req: NextRequest) {
  // The signature covers the exact bytes on the wire, so the body must be read raw and parsed
  // from that same string afterwards — `req.json()` would consume the stream and leave nothing
  // to verify against.
  const signature = req.headers.get(SIGNATURE_HEADER);
  const rawBody = await req.text();

  if (!verifySignature(rawBody, signature)) {
    console.warn("[WEBHOOK] Rejected request: missing or invalid signature");
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    const payload = JSON.parse(rawBody) as WAWebhookPayload;

    // A payload for a product we are not handling is not a failure — acknowledge and drop it.
    if (payload?.object !== WA_WEBHOOK_OBJECT) {
      console.warn(
        `[WEBHOOK] Ignoring payload with unexpected object: ${payload?.object}`
      );
      return NextResponse.json({ success: true }, { status: 200 });
    }

    for (const entry of payload.entry ?? []) {
      try {
        await processEntry(entry);
      } catch (error) {
        // Contained here so the remaining entries — potentially other tenants' — still run.
        console.error(`[WEBHOOK] Failed to process entry ${entry.id}:`, error);
      }
    }
  } catch (error) {
    console.error("[WEBHOOK] Unrecoverable error:", error);
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
