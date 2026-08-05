// ============================================================================
// MODULE : WhatsApp inbound processing
// ============================================================================
//
// The ingestion spine for every inbound WhatsApp message: tenant → contact →
// conversation → message, followed by the reactions that message triggers (read
// receipt, realtime broadcast, campaign reply credit, chatbot flow, AI auto-reply).
//
// This logic used to live inside app/api/webhook/whatsapp/route.ts and ran inline
// on the request Meta was waiting on. It now has two callers — the QStash inbound
// worker in production, and the webhook itself when SKIP_QUEUE is set for local
// development — so it lives here rather than in either of them. Nothing about the
// behaviour changed in the move: the ordering, the transactions, the idempotency
// guards and the per-reaction error containment are all as they were.
//
// The one rule that survives from the original module and still governs everything
// here: persisting the customer's message is the step that must not fail, and every
// reaction that follows it may. Each reaction therefore contains its own failures,
// and all of them are gated on `isNew` so that a Meta redelivery cannot send a
// second reply to the customer.

import { createHash } from "node:crypto";
import {
  ConversationStatus,
  MessageDirection,
  MessageStatus,
  MessageType,
  Prisma,
} from "@prisma/client";
import type { Contact, Conversation, Message } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureDefaultBusiness, resolveWhatsAppCreds } from "@/lib/business";
import { decryptSecret } from "@/lib/crypto";
import { generateReply } from "@/lib/ai";
import { retrieveContext } from "@/lib/rag";
import { pusher, tenantChannel, PusherEvent } from "@/lib/pusher";
import { markMessageAsRead, sendTextMessage } from "@/lib/whatsapp";
import { runFlowStep, type FlowVariables } from "@/lib/chatbot/engine";
import { toFlowDocument } from "@/lib/chatbot/types";
import { cachedAiReply } from "@/lib/cache";
import { publishAiReply } from "@/lib/queue";
import type { WAMessage } from "@/types";

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
 * TenantSettings with its parent Tenant eagerly loaded, plus the resolved businessId.
 *
 * Callers need both halves on every inbound event — the settings carry the WhatsApp
 * credentials and AI flags, while the tenant carries `isActive` and the `tenantId` that
 * scopes every downstream write — so they are resolved together in a single round trip.
 */
export type ResolvedTenant = Prisma.TenantSettingsGetPayload<{
  include: { tenant: true };
}> & { businessId: string };

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
export async function resolveTenant(phoneNumberId: string): Promise<ResolvedTenant> {
  // Prefer the Business that owns this Meta phone_number_id. That is what the inbox is scoped
  // to — routing via TenantSettings first and then falling back to the tenant's *oldest*
  // business is what made messages land in one workspace while the agent watched another.
  const ownedBusiness = await prisma.business.findFirst({
    where: { whatsappPhoneNumberId: phoneNumberId, tenant: { isActive: true } },
    select: { id: true, tenantId: true },
  });

  if (ownedBusiness) {
    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId: ownedBusiness.tenantId },
      include: { tenant: true },
    });
    if (!settings) {
      throw new Error(
        `No settings configured for tenant "${ownedBusiness.tenantId}" (business ${ownedBusiness.id})`
      );
    }
    if (!settings.tenant.isActive) {
      throw new Error(
        `Tenant inactive: "${settings.tenant.slug}" (${settings.tenantId})`
      );
    }
    return { ...settings, businessId: ownedBusiness.id };
  }

  // Legacy path: WhatsApp was configured on TenantSettings only, before multi-business.
  // No Business row claims this number yet — resolve a real business and attach the number
  // so the next delivery (and the business switcher) agree on where the inbox lives.
  const settings = await prisma.tenantSettings.findFirst({
    where: { waPhoneNumberId: phoneNumberId },
    include: { tenant: true },
  });

  if (!settings) {
    throw new Error(
      `No tenant configured for WhatsApp phone_number_id "${phoneNumberId}"`
    );
  }

  if (!settings.tenant.isActive) {
    throw new Error(
      `Tenant inactive: "${settings.tenant.slug}" (${settings.tenantId})`
    );
  }

  const defaultBusiness = await ensureDefaultBusiness(settings.tenantId);

  // Claim the number on the default business when it has none. Skip if it already carries a
  // different number — overwriting would steal routing from that workspace.
  if (!defaultBusiness.whatsappPhoneNumberId) {
    try {
      await prisma.business.update({
        where: { id: defaultBusiness.id },
        data: { whatsappPhoneNumberId: phoneNumberId },
      });
      console.log("[INBOUND] Synced WhatsApp phone_number_id onto default business", {
        businessId: defaultBusiness.id,
        phoneNumberId,
        tenantId: settings.tenantId,
      });
    } catch (error) {
      // Unique race with another business claiming the same id — fall through; routing still
      // uses defaultBusiness.id for this delivery, and the next resolve will pick the winner.
      console.warn("[INBOUND] Could not sync phone_number_id onto default business", {
        businessId: defaultBusiness.id,
        phoneNumberId,
        error: String(error),
      });
    }
  }

  return { ...settings, businessId: defaultBusiness.id };
}

/**
 * Resolve a tenant the way `resolveTenant` does, but from the ids a queued job carries.
 *
 * A worker is called by QStash over HTTP and has no Meta payload to read a `phone_number_id`
 * from — `AiReplyJob` is keyed by tenantId and businessId instead — so the phone-number lookup
 * above and its Business fallback have nothing to work with here. The settings row is read
 * directly by its unique tenantId.
 *
 * The `isActive` guard is repeated rather than skipped. A job can sit in the queue across a
 * workspace being suspended, and a suspended tenant must not have a reply sent, or a model
 * billed, on their behalf — the check has to happen where the work happens, not only where it
 * was enqueued.
 */
export async function resolveTenantById(
  tenantId: string,
  businessId: string
): Promise<ResolvedTenant> {
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    include: { tenant: true },
  });

  if (!settings) {
    throw new Error(`No settings configured for tenant "${tenantId}"`);
  }

  if (!settings.tenant.isActive) {
    throw new Error(
      `Tenant inactive: "${settings.tenant.slug}" (${settings.tenantId})`
    );
  }

  return { ...settings, businessId };
}

/**
 * Effective auto-reply config for a business.
 *
 * AI Settings writes TenantSettings; the Businesses page writes Business.aiEnabled /
 * autoReply. Inbound used to read only TenantSettings, so turning AI on in Businesses
 * did nothing. Business flags win when set; otherwise we fall back to the tenant row.
 */
async function resolveAutoReplyConfig(tenant: ResolvedTenant) {
  const business = await prisma.business.findUnique({
    where: { id: tenant.businessId },
    select: {
      aiEnabled: true,
      autoReply: true,
      autoReplyDelay: true,
      aiModel: true,
      aiPersonality: true,
      aiSystemPrompt: true,
      name: true,
    },
  });

  const aiEnabled = Boolean(business?.aiEnabled || tenant.aiEnabled);
  const autoReply = Boolean(business?.autoReply || tenant.autoReply);

  return {
    aiEnabled,
    autoReply,
    autoReplyDelay: business?.autoReplyDelay ?? tenant.autoReplyDelay ?? 0,
    aiModel: business?.aiModel || tenant.aiModel,
    aiPersonality:
      business?.aiSystemPrompt?.trim() ||
      business?.aiPersonality?.trim() ||
      tenant.aiPersonality,
    businessName: business?.name ?? null,
  };
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
  businessId: string,
  phone: string,
  name?: string
): Promise<Contact> {
  const profileName = name?.trim();

  return prisma.contact.upsert({
    where: { phone_businessId: { phone, businessId } },
    // Omitting `name` entirely leaves the stored value untouched; Prisma maintains
    // `updatedAt` on its own via the schema's `@updatedAt` attribute.
    update: profileName ? { name: profileName } : {},
    // A contact with no profile name is still addressable by number, so the phone
    // doubles as the display name until an agent or a later payload supplies a better one.
    create: { tenantId, businessId, phone, name: profileName || phone },
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
export async function findOrCreateConversation(
  tenantId: string,
  businessId: string,
  contactId: string
): Promise<Conversation> {
  const existing = await prisma.conversation.findFirst({
    where: { tenantId, contactId },
    orderBy: { createdAt: "desc" },
  });

  if (existing) return existing;

  return prisma.conversation.create({
    data: { tenantId, businessId, contactId },
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
export function extractContent(message: WAMessage): string | null {
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
    const apiKey = decryptSecret(tenant.waApiKey);
    if (!apiKey) return;
    await markMessageAsRead(
      tenant.waPhoneNumberId,
      apiKey,
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
 * Execute a chatbot flow for an inbound message and return whether a flow ran.
 *
 * Two entry paths:
 * - The conversation already has an active flow session (resumed mid-Q&A): resume
 *   from the paused question node, passing the user's reply as input.
 * - No active session: match the message text against keyword triggers of all
 *   published flows; start from the beginning of the first match.
 *
 * Each action the engine emits is sent to the customer immediately, in order.
 * When the engine pauses on a Question node, the session state (flow id, node id,
 * collected variables) is written back to the conversation so the next inbound
 * message continues the same flow. When the flow ends, the session is cleared.
 */
async function executeFlow(
  tenant: ResolvedTenant,
  conversation: Conversation & { activeFlowId?: string | null; activeNodeId?: string | null; flowVars?: Prisma.JsonValue },
  contact: Contact,
  inboundText: string | null,
): Promise<boolean> {
  const flowCreds = await resolveWhatsAppCreds(tenant.businessId);
  if (!flowCreds.phoneNumberId || !flowCreds.apiKey) return false;

  let flowId: string | null = conversation.activeFlowId ?? null;
  let fromNodeId: string | undefined = conversation.activeNodeId ?? undefined;
  let vars: FlowVariables = (conversation.flowVars as FlowVariables | null) ?? {};
  const isResuming = Boolean(flowId && fromNodeId);

  // Match a new flow by keyword when no session is active.
  if (!isResuming) {
    if (!inboundText) return false;
    const normalised = inboundText.toLowerCase().trim();
    // Tokenise so keyword "hi" does not steal "hello" / "this" via String.includes.
    const tokens = normalised.split(/[^a-z0-9]+/).filter(Boolean);

    const activeFlows = await prisma.chatbotFlow.findMany({
      where: {
        tenantId: tenant.tenantId,
        businessId: tenant.businessId,
        isActive: true,
      },
      select: { id: true, keywords: true, nodes: true, edges: true },
    });

    const matched = activeFlows.find((f) =>
      f.keywords.some((kw) => {
        const k = kw.toLowerCase().trim();
        if (!k) return false;
        if (normalised === k) return true;
        // Multi-word keywords must appear as a whole phrase; single words as whole tokens.
        if (k.includes(" ")) return normalised.includes(k);
        return tokens.includes(k);
      }),
    );
    if (!matched) return false;

    console.log("[INBOUND] Chatbot flow matched", {
      flowId: matched.id,
      text: inboundText,
      conversationId: conversation.id,
    });

    flowId = matched.id;
    fromNodeId = undefined;
    vars = {};
  }

  const flow = await prisma.chatbotFlow.findFirst({
    where: { id: flowId!, tenantId: tenant.tenantId },
  });
  if (!flow) {
    // Stale session — clear it.
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { activeFlowId: null, activeNodeId: null, flowVars: Prisma.JsonNull },
    });
    return false;
  }

  const doc = toFlowDocument(flow.nodes, flow.edges);
  const result = await runFlowStep(doc, {
    fromNodeId,
    input: isResuming ? (inboundText ?? "") : undefined,
    variables: vars,
  });

  // Send every message action to the customer.
  let sentCount = 0;
  for (const action of result.actions) {
    if ((action.type === "message" || action.type === "ai") && action.text) {
      try {
        await sendTextMessage(flowCreds.phoneNumberId, flowCreds.apiKey, contact.phone, action.text);
        sentCount += 1;
      } catch (err) {
        console.error("[FLOW] Failed to send message:", err);
      }
    }
  }

  // Persist or clear session state.
  if (result.status === "awaiting_input" && result.awaitingQuestionId) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        activeFlowId: flow.id,
        activeNodeId: result.awaitingQuestionId,
        flowVars: result.variables as Prisma.InputJsonValue,
      },
    });
    return true;
  }

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { activeFlowId: null, activeNodeId: null, flowVars: Prisma.JsonNull },
  });

  // Handoff: assign to a human, disable AI active flag.
  if (result.handoff) {
    const handoff = result.actions.find((a) => a.type === "handoff")?.handoff;
    await assignConversationToAgent(conversation, handoff);
    return true;
  }

  // Only claim the turn if the customer saw something. An empty/broken flow must not
  // block the AI auto-reply path — that is why "hi"/"hello" produced no reply at all.
  if (sentCount === 0) {
    console.warn("[INBOUND] Flow matched but sent nothing — falling through to AI", {
      flowId: flow.id,
      conversationId: conversation.id,
      status: result.status,
    });
    return false;
  }

  return true;
}

/**
 * Hand a conversation to a human, picking the agent with the lightest live workload.
 *
 * Before this, a handoff node only cleared `isAiActive`, which took the bot out of the thread but
 * left the conversation belonging to nobody — it stayed OPEN and unassigned in a shared inbox, which
 * is the state a handoff is supposed to end. The flow's `team`/`queue`/`department` were collected in
 * the builder and then discarded entirely.
 *
 * Least-loaded rather than strict round-robin: the candidate with the fewest conversations still
 * open is chosen, which is self-correcting — an agent who resolves their threads becomes eligible
 * again, and one who is buried stops receiving work. Round-robin over a fixed order would keep
 * feeding a saturated agent.
 *
 * The requested team/queue/department cannot be honoured as *routing*: `User` has no department or
 * skills column, and inventing one is a schema change. It is preserved as a conversation label
 * instead, so the intent survives on the thread and an agent can see which queue the bot meant —
 * `labels` is an existing `String[]` on Conversation, so this costs no migration.
 *
 * Assigning is best-effort. A workspace with no active agents simply keeps the thread unassigned
 * (still with AI off, which is the part that must not fail), rather than erroring out of a webhook.
 */
async function assignConversationToAgent(
  conversation: Conversation,
  handoff?: { team?: string; queue?: string; department?: string; note?: string }
): Promise<void> {
  // The queue the flow asked for, kept as a label. Deduplicated against what the thread already
  // carries so a customer who loops through the same handoff twice does not stack duplicates.
  const requestedQueue = handoff?.team ?? handoff?.queue ?? handoff?.department ?? null;
  const labels = requestedQueue && !conversation.labels.includes(requestedQueue)
    ? [...conversation.labels, requestedQueue]
    : conversation.labels;

  let assignedToId: string | null = conversation.assignedToId;

  // An already-assigned thread keeps its agent: a handoff mid-conversation should not yank the
  // customer away from the person already talking to them.
  if (!assignedToId) {
    const agents = await prisma.user.findMany({
      where: {
        tenantId: conversation.tenantId,
        isActive: true,
        role: { in: ["AGENT", "MANAGER", "ADMIN", "TENANT_OWNER"] },
      },
      select: {
        id: true,
        _count: {
          select: {
            assignedConvs: {
              where: { status: { in: [ConversationStatus.OPEN, ConversationStatus.ASSIGNED] } },
            },
          },
        },
      },
    });

    if (agents.length > 0) {
      // Ties break on id so the choice is deterministic rather than dependent on row order.
      agents.sort(
        (a, b) =>
          a._count.assignedConvs - b._count.assignedConvs ||
          a.id.localeCompare(b.id)
      );
      assignedToId = agents[0].id;
    }
  }

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      isAiActive: false,
      labels,
      ...(assignedToId && {
        assignedToId,
        status: ConversationStatus.ASSIGNED,
      }),
    },
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
export async function handleAutoReply(
  tenant: ResolvedTenant,
  conversation: Conversation,
  contact: Contact,
  applyDelay = true
): Promise<void> {
  const cfg = await resolveAutoReplyConfig(tenant);

  const live = await prisma.conversation.findUnique({
    where: { id: conversation.id },
    select: { isAiActive: true },
  });
  const threadOn = live?.isAiActive === true;
  const workspaceOn = cfg.aiEnabled && cfg.autoReply;

  if (!threadOn && !workspaceOn) {
    console.log("[INBOUND] Skipping AI reply — AI off on thread and workspace", {
      tenantId: tenant.tenantId,
      businessId: tenant.businessId,
      businessName: cfg.businessName,
      isAiActive: live?.isAiActive ?? null,
      effectiveAiEnabled: cfg.aiEnabled,
      effectiveAutoReply: cfg.autoReply,
    });
    return;
  }

  const creds = await resolveWhatsAppCreds(tenant.businessId);
  if (!creds.phoneNumberId || !creds.apiKey) {
    console.warn(
      `[INBOUND] Auto-reply enabled for tenant ${tenant.tenantId} but WhatsApp credentials are missing on business ${tenant.businessId}`
    );
    return;
  }

  const history = await loadConversationHistory(
    tenant.tenantId,
    conversation.id
  );

  // Nothing to reply to — a thread whose only messages are media or notes gives the model no turn.
  if (!history.length) {
    console.log("[INBOUND] Skipping AI reply — no text history", {
      conversationId: conversation.id,
    });
    return;
  }

  // RAG: ground the reply in the tenant's knowledge base, scoped to what the customer just asked.
  const lastCustomerMsg = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
  const knowledgeContext = await retrieveContext(tenant.tenantId, tenant.businessId, lastCustomerMsg);

  const personality = cfg.aiPersonality?.trim() || DEFAULT_AI_PERSONALITY;

  // Identical inputs must not be paid for twice. Everything that can change the completion goes
  // into the key — the workspace, the model, the persona, the retrieved knowledge and the tail of
  // the thread — so a change to any of them misses rather than serving a reply drafted for
  // different circumstances. tenantId is in there deliberately: without it, two workspaces sharing
  // a persona would serve each other's cached replies to an identical greeting.
  const cacheKey = createHash("sha256")
    .update(
      [
        tenant.tenantId,
        cfg.aiModel ?? "",
        personality,
        knowledgeContext,
        JSON.stringify(history.slice(-3)),
      ].join("\0")
    )
    .digest("hex");

  let reply: string;
  try {
    console.log("[INBOUND] Generating AI reply", {
      conversationId: conversation.id,
      businessId: tenant.businessId,
      model: cfg.aiModel,
    });
    reply = (
      await cachedAiReply(cacheKey, () =>
        generateReply(history, personality, knowledgeContext, cfg.aiModel)
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
  if (!reply) {
    console.warn("[INBOUND] AI returned empty reply — not sending", {
      conversationId: conversation.id,
    });
    return;
  }

  // Honor the configurable reply delay (in seconds). A zero or missing value sends immediately.
  //
  // `applyDelay` is false when the caller has already waited on our behalf: the AI worker is
  // delivered by QStash with `delay` set to this same value, so sleeping again here would double
  // it. Sleeping in the worker is also what a queue exists to avoid — a long autoReplyDelay would
  // hold the function open past its timeout, fail the job, and have QStash redeliver it.
  const delayMs = applyDelay ? cfg.autoReplyDelay * 1000 : 0;
  if (delayMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, delayMs));

  let waMessageId: string | null;
  try {
    const sent = await sendTextMessage(
      creds.phoneNumberId,
      creds.apiKey,
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
  console.log("[INBOUND] AI reply sent", {
    conversationId: conversation.id,
    waMessageId,
    businessId: tenant.businessId,
  });
}

/**
 * Route the auto-reply either onto the queue or straight through, and nowhere else.
 *
 * This is the seam the queue is really for. Drafting a reply is the slowest thing the ingestion
 * path does — a model call of three to eight seconds, plus a RAG lookup and a Meta send — and it
 * is the step that pushed the webhook past Meta's timeout and into the retry loop that produced
 * duplicate replies. Publishing instead of calling hands all of it to a worker QStash will retry
 * on its own terms.
 *
 * The `aiEnabled`/`autoReply` gate is applied here as well as inside `handleAutoReply`. The check
 * is cheap and the queue hop is not: a workspace with AI switched off should not have a job
 * published, delivered and authenticated only for the worker to discard it on arrival.
 *
 * The delay travels with the job rather than being slept through. QStash holds the message for
 * `autoReplyDelay` seconds and only then calls the worker, which is why the worker passes
 * `applyDelay: false` — the wait has already happened, off our compute.
 *
 * SKIP_QUEUE is the local-development path: QStash is a cloud service and cannot call localhost,
 * so the reply is generated inline exactly as it was before the queue existed, delay included.
 */
async function dispatchAutoReply(
  tenant: ResolvedTenant,
  conversation: Conversation,
  contact: Contact,
  waMessageId: string
): Promise<void> {
  const cfg = await resolveAutoReplyConfig(tenant);

  // Re-read the thread toggle — agents flip it in the inbox after the conversation row
  // was loaded, and that switch is what your screenshot shows as ON.
  const live = await prisma.conversation.findUnique({
    where: { id: conversation.id },
    select: { isAiActive: true },
  });
  const threadOn = live?.isAiActive === true;
  const workspaceOn = cfg.aiEnabled && cfg.autoReply;

  // Honour either the inbox "AI Auto-Reply" toggle OR workspace AI Settings / Business flags.
  // Keys alone are not enough — without one of these, we never publish /api/workers/ai-reply.
  if (!threadOn && !workspaceOn) {
    console.log("[INBOUND] Not queueing AI reply — AI off on thread and workspace", {
      tenantId: tenant.tenantId,
      businessId: tenant.businessId,
      businessName: cfg.businessName,
      isAiActive: live?.isAiActive ?? null,
      effectiveAiEnabled: cfg.aiEnabled,
      effectiveAutoReply: cfg.autoReply,
      conversationId: conversation.id,
    });
    return;
  }

  if (process.env.SKIP_QUEUE === "true") {
    await handleAutoReply(tenant, conversation, contact);
    return;
  }

  console.log("[INBOUND] Queueing AI reply job", {
    conversationId: conversation.id,
    businessId: tenant.businessId,
    delaySeconds: cfg.autoReplyDelay,
    waMessageId,
    reason: threadOn ? "thread_toggle" : "workspace_flags",
  });

  await publishAiReply(
    {
      tenantId: tenant.tenantId,
      businessId: tenant.businessId,
      conversationId: conversation.id,
      contactPhone: contact.phone,
      // The message being answered. The worker uses it to tell a redelivery apart from a
      // genuine new turn, so it cannot reply twice to the same customer message.
      waMessageId,
    },
    cfg.autoReplyDelay
  );
}

/**
 * Credit a campaign recipient's reply, the first time they answer a broadcast.
 *
 * "Replied" is the one campaign metric Meta never reports: a reply is an ordinary inbound message,
 * indistinguishable at the API from any other. It is therefore inferred here — the sender is matched
 * against recipients of this tenant's campaigns who were sent to and have not yet replied.
 *
 * Only the most recent such send is credited, and only once (`repliedAt` null-guarded), so an ongoing
 * conversation cannot keep incrementing `repliedCount` with every message the customer types.
 */
async function creditCampaignReply(
  tenantId: string,
  phone: string
): Promise<void> {
  const recipient = await prisma.campaignContact.findFirst({
    where: {
      phone,
      repliedAt: null,
      sentAt: { not: null },
      campaign: { tenantId },
    },
    orderBy: { sentAt: "desc" },
    select: { id: true, campaignId: true },
  });

  if (!recipient) return;

  try {
    await prisma.$transaction([
      prisma.campaignContact.update({
        where: { id: recipient.id },
        data: { repliedAt: new Date() },
      }),
      prisma.campaign.update({
        where: { id: recipient.campaignId },
        data: { repliedCount: { increment: 1 } },
      }),
    ]);
  } catch (error) {
    console.error(
      `[WEBHOOK] Failed to credit campaign reply from ${phone}:`,
      error
    );
  }
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
export async function processIncomingMessage(
  tenant: ResolvedTenant,
  message: WAMessage,
  contactName?: string
): Promise<InboundMessageResult> {
  // Stick to the business that already owns this phone's thread. Routing can flip between a
  // legacy default business and the WhatsApp-connected one across deliveries; creating a second
  // contact under the new businessId makes the inbox the agent is watching look like it was wiped.
  const priorContact = await prisma.contact.findFirst({
    where: { tenantId: tenant.tenantId, phone: message.from },
    orderBy: { updatedAt: "desc" },
    select: { id: true, businessId: true },
  });

  const businessId = priorContact?.businessId ?? tenant.businessId;
  if (priorContact && priorContact.businessId !== tenant.businessId) {
    console.warn("[INBOUND] Keeping conversation on existing business (routing differed)", {
      phone: message.from,
      routedBusinessId: tenant.businessId,
      existingBusinessId: priorContact.businessId,
      waMessageId: message.id,
    });
  }

  const scopedTenant: ResolvedTenant = { ...tenant, businessId };
  const autoCfg = await resolveAutoReplyConfig(scopedTenant);

  const contact = await upsertContact(
    scopedTenant.tenantId,
    businessId,
    message.from,
    contactName
  );

  // Fetch conversation with flow session fields so executeFlow can resume mid-Q&A.
  const existingConv = await prisma.conversation.findFirst({
    where: { tenantId: scopedTenant.tenantId, businessId, contactId: contact.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, activeFlowId: true, activeNodeId: true, flowVars: true },
  });

  const conversation = existingConv
    ? await prisma.conversation.findUnique({ where: { id: existingConv.id } })!
    : await prisma.conversation.create({
        data: {
          tenantId: scopedTenant.tenantId,
          businessId,
          contactId: contact.id,
          // Match the inbox AI toggle to workspace auto-reply so new threads reply by default.
          isAiActive: autoCfg.aiEnabled && autoCfg.autoReply,
        },
      });

  if (!conversation) throw new Error("Failed to resolve conversation");

  const { message: saved, isNew } = await saveInboundMessage(
    scopedTenant.tenantId,
    conversation.id,
    message
  );

  if (isNew) {
    await markInboundAsRead(scopedTenant, message.id);
    await broadcastMessage(scopedTenant.tenantId, saved);

    // Guarded by `isNew`, so a redelivered inbound message cannot credit the same reply twice.
    await creditCampaignReply(scopedTenant.tenantId, contact.phone);

    // Flow execution takes priority over generic AI auto-reply.
    const flowHandled = await executeFlow(
      scopedTenant,
      {
        ...conversation,
        activeFlowId: existingConv?.activeFlowId ?? null,
        activeNodeId: existingConv?.activeNodeId ?? null,
        flowVars: existingConv?.flowVars ?? null,
      },
      contact,
      extractContent(message),
    );
    if (!flowHandled) {
      await dispatchAutoReply(scopedTenant, conversation, contact, message.id);
    }
  }

  return { tenant: scopedTenant, contact, conversation, message: saved };
}

