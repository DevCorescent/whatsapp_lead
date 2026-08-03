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
// Conversation and inbound Message originates here. It no longer performs that ingestion itself —
// it attributes the delivery to a tenant, hands each message to a queue, and answers Meta.
//
//   POST → processEntry → processChange → cachedResolveTenant   (Redis, 5 min)
//                                       → dispatchInboundMessage
//                                           → publishInboundMessage  (QStash)
//                                           → processIncomingMessage (only when SKIP_QUEUE)
//                                       → processStatusUpdate   (agent-authored messages)
//                                       → applyCampaignReceipt  (campaign recipients)
//
// The ingestion chain itself — upsertContact, saveInboundMessage, markInboundAsRead,
// broadcastMessage, creditCampaignReply, executeFlow, and the AI auto-reply — lives in
// lib/inbound.ts and runs in /api/workers/inbound. It was moved off this path because a model call
// of three to eight seconds does not fit inside the few seconds Meta allows before it declares the
// delivery failed and retries it, which is what produced duplicate AI replies to customers.
//
// Delivery receipts deliberately stay here: they are cheap, ordered writes that the queue's
// at-least-once redelivery would only put at risk. See processChange.



import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { MessageStatus } from "@prisma/client";
import type { Message } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cachedResolveTenant } from "@/lib/cache";
import { publishInboundMessage } from "@/lib/queue";
import {
  extractContent,
  processIncomingMessage,
  resolveTenant,
  resolveTenantById,
} from "@/lib/inbound";
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

  // Log first 8 chars of each so you can spot a mismatch without exposing the full secret.
  console.log("[WEBHOOK] HMAC check", {
    receivedPrefix: received.toString("hex").slice(0, 8),
    expectedPrefix: expected.toString("hex").slice(0, 8),
    appSecretLength: appSecret.length,
    appSecretPrefix: appSecret.slice(0, 4),
    bodyLength: rawBody.length,
  });

  if (received.length !== expected.length) return false;

  return timingSafeEqual(received, expected);
}


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
 * Apply a delivery receipt to the campaign recipient it belongs to.
 *
 * Runs alongside `processStatusUpdate` rather than inside it, because a campaign send writes no
 * `Message` row — the broadcast goes straight to Meta — so the lookup above finds nothing for these
 * receipts and returns null. The two handlers are therefore disjoint by construction: a receipt
 * belongs either to an agent-authored message or to a campaign recipient, never to both.
 *
 * `waMessageId` is unique on `CampaignContact`, so the recipient is found by the only key a receipt
 * carries. Tenant ownership is asserted through the parent campaign rather than trusted from the
 * payload: this endpoint is unauthenticated, and a globally unique id identifies a row without
 * authorising access to it.
 *
 * Both writes are monotonic and first-write-wins. Meta redelivers receipts and emits them out of
 * order, so `deliveredAt`/`readAt` are only stamped when still null, and the campaign's counter is
 * only incremented on that same first transition — otherwise a redelivered `read` callback would
 * inflate `readCount` past the number of recipients. The stamp and the counter move together in one
 * transaction, so they cannot disagree.
 *
 * Failures are contained here, as with the other side concerns on this path: a counter that could
 * not be moved is not a reason to fail a webhook that must still answer 200.
 */
async function applyCampaignReceipt(
  tenantId: string,
  status: WAStatus
): Promise<void> {
  const incoming = META_TO_MESSAGE_STATUS[status.status];
  if (incoming !== MessageStatus.DELIVERED && incoming !== MessageStatus.READ) return;

  const recipient = await prisma.campaignContact.findUnique({
    where: { waMessageId: status.id },
    select: {
      id: true,
      deliveredAt: true,
      readAt: true,
      campaign: { select: { id: true, tenantId: true } },
    },
  });

  if (!recipient || recipient.campaign.tenantId !== tenantId) return;

  // `read` implies delivery even when the `delivered` callback never arrived or arrived after it.
  const stampDelivered = recipient.deliveredAt === null;
  const stampRead = incoming === MessageStatus.READ && recipient.readAt === null;
  if (!stampDelivered && !stampRead) return;

  const now = new Date();

  try {
    await prisma.$transaction([
      prisma.campaignContact.update({
        where: { id: recipient.id },
        data: {
          ...(stampDelivered && { deliveredAt: now }),
          ...(stampRead && { readAt: now }),
        },
      }),
      prisma.campaign.update({
        where: { id: recipient.campaign.id },
        data: {
          ...(stampDelivered && { deliveredCount: { increment: 1 } }),
          ...(stampRead && { readCount: { increment: 1 } }),
        },
      }),
    ]);
  } catch (error) {
    console.error(
      `[WEBHOOK] Failed to apply campaign receipt ${status.id}:`,
      error
    );
  }
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
/**
 * The identity a change has been attributed to — the only thing this route now resolves itself.
 *
 * Ingestion needs the full TenantSettings row; publishing a job needs three ids. Resolving only
 * the ids here is what lets the answer be cached: a `phone_number_id` maps to the same workspace
 * for as long as its credentials are unchanged, whereas the settings row carries AI flags and
 * personas that an agent can edit at any moment and that must not be served stale to a reply.
 */
interface TenantIdentity {
  tenantId: string;
  businessId: string;
  phoneNumberId: string;
}

/**
 * Hand one inbound message to the queue, or straight to the pipeline in local development.
 *
 * This is the seam the whole exercise turns on. Meta allows a few seconds before it calls a
 * delivery failed, retries it, and — after sustained failures — unsubscribes the business account.
 * The ingestion chain behind `processIncomingMessage` cannot promise to fit in that budget once a
 * model call is on it, so the webhook stops waiting for the work and publishes it instead: one
 * HTTP call to QStash, and the customer's message is durably owned by a queue that will retry on
 * its own terms rather than by Meta's.
 *
 * The whole `WAMessage` travels on the job because that is what the pipeline consumes. The
 * flattened fields beside it are the ones a human needs to recognise a job in the QStash console
 * when a delivery has to be traced after the fact.
 *
 * SKIP_QUEUE is the local-development path: QStash is a cloud service and cannot reach localhost,
 * so the message is processed inline exactly as it was before the queue existed.
 */
async function dispatchInboundMessage(
  identity: TenantIdentity,
  message: WAMessage,
  contactName?: string
): Promise<void> {
  if (process.env.SKIP_QUEUE === "true") {
    console.log("[WEBHOOK] SKIP_QUEUE enabled; processing inbound inline", {
      waMessageId: message.id,
      from: message.from,
      tenantId: identity.tenantId,
      businessId: identity.businessId,
      phoneNumberId: identity.phoneNumberId,
      type: message.type,
    });
    const tenant = await resolveTenantById(identity.tenantId, identity.businessId);
    await processIncomingMessage(tenant, message, contactName);
    console.log("[WEBHOOK] Inline inbound processing finished", {
      waMessageId: message.id,
      tenantId: identity.tenantId,
      businessId: identity.businessId,
    });
    return;
  }

  console.log("[WEBHOOK] Queueing inbound message", {
    waMessageId: message.id,
    from: message.from,
    tenantId: identity.tenantId,
    businessId: identity.businessId,
    phoneNumberId: identity.phoneNumberId,
    type: message.type,
  });

  await publishInboundMessage({
    tenantId: identity.tenantId,
    businessId: identity.businessId,
    phoneNumberId: identity.phoneNumberId,
    waMessageId: message.id,
    from: message.from,
    contactName,
    type: message.type,
    content: extractContent(message),
    timestamp: message.timestamp,
    rawMessage: message,
  });

  console.log("[WEBHOOK] Inbound message queued", {
    waMessageId: message.id,
    tenantId: identity.tenantId,
    businessId: identity.businessId,
  });
}

async function processChange(change: WAChange): Promise<void> {
  const { metadata, contacts, messages, statuses } = change.value;

  // Nothing actionable in this change — a field update we do not subscribe to.
  if (!messages?.length && !statuses?.length) {
    console.log("[WEBHOOK] Ignoring non-message WhatsApp change", {
      field: change.field,
      phoneNumberId: metadata?.phone_number_id,
    });
    return;
  }

  const phoneNumberId = metadata.phone_number_id;

  console.log("[WEBHOOK] WhatsApp change received", {
    field: change.field,
    phoneNumberId,
    messageCount: messages?.length ?? 0,
    statusCount: statuses?.length ?? 0,
    contactCount: contacts?.length ?? 0,
  });

  // The lookup this replaces cost two to three queries on every single delivery, on Meta's clock,
  // to answer a question whose answer almost never changes. It is cached for five minutes, keyed
  // by the number Meta addressed. `resolveTenant` still does the resolving — including the
  // inactive-tenant guard, so only active workspaces are ever cached — it simply runs on a miss
  // instead of on every message. A credential change invalidates the entry explicitly rather than
  // waiting the window out; see invalidateTenantCache.
  const { tenantId, businessId } = await cachedResolveTenant(phoneNumberId, async () => {
    const tenant = await resolveTenant(phoneNumberId);
    return { tenantId: tenant.tenantId, businessId: tenant.businessId };
  });

  console.log("[WEBHOOK] Tenant resolved", { tenantId, businessId, phoneNumberId, messageCount: messages?.length ?? 0 });

  for (const message of messages ?? []) {
    // Match each sender to their own profile entry. Meta can batch messages from several contacts
    // into one change, in which case taking contacts[0] would file every message under the first
    // sender's name — creating the second contact with the wrong person's name entirely.
    const profile = contacts?.find((contact) => contact.wa_id === message.from);

    console.log("[WEBHOOK] Dispatching message", { waMessageId: message.id, from: message.from, type: message.type, skipQueue: process.env.SKIP_QUEUE === "true" });

    await dispatchInboundMessage(
      { tenantId, businessId, phoneNumberId },
      message,
      profile?.profile?.name
    );

    console.log("[WEBHOOK] Message dispatched", { waMessageId: message.id });
  }

  // Receipts stay on the request path. They are one indexed lookup and one narrow update, with no
  // model call and no outbound send, so they do not threaten the timeout the queue exists to
  // protect — and both are ordered writes. `processStatusUpdate` only ever moves a message up the
  // STATUS_RANK ladder and `applyCampaignReceipt` stamps first-write-wins, which is exactly the
  // kind of ordering that QStash's at-least-once redelivery would race for no gain.
  for (const status of statuses ?? []) {
    console.log("[WEBHOOK] Processing status receipt", {
      waMessageId: status.id,
      status: status.status,
      tenantId,
      businessId,
      phoneNumberId,
    });
    await processStatusUpdate(tenantId, status);
    // Disjoint from the call above: campaign sends write no Message row, so a receipt for one is
    // invisible to `processStatusUpdate` and has to be attributed through `CampaignContact`.
    await applyCampaignReceipt(tenantId, status);
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
 * Only attribution and publication happen before the response is returned. The ingestion chain
 * used to run inline here, and stopped fitting inside Meta's timeout once an AI reply was on it —
 * a model call of three to eight seconds meant Meta timed out, retried, and the retry generated a
 * second reply to the customer. That work is now published to QStash and performed by
 * /api/workers/inbound, which is a durable queue rather than fire-and-forget: a serverless
 * function is not guaranteed to finish anything the response did not wait for.
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

  console.log("[WEBHOOK] POST received", {
    hasSignature: !!signature,
    bodyLength: rawBody.length,
    appSecretConfigured: !!process.env.WHATSAPP_APP_SECRET,
    qstashTokenConfigured: !!process.env.QSTASH_TOKEN,
    skipQueue: process.env.SKIP_QUEUE === "true",
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "(fallback hardcoded)",
  });

  if (!verifySignature(rawBody, signature)) {
    console.warn("[WEBHOOK] Rejected: signature invalid", {
      appSecretMissing: !process.env.WHATSAPP_APP_SECRET,
      signaturePresent: !!signature,
    });
    return new NextResponse("Forbidden", { status: 403 });
  }

  console.log("[WEBHOOK] Signature verified — processing payload");

  try {
    const payload = JSON.parse(rawBody) as WAWebhookPayload;

    // A payload for a product we are not handling is not a failure — acknowledge and drop it.
    if (payload?.object !== WA_WEBHOOK_OBJECT) {
      console.warn(
        `[WEBHOOK] Ignoring payload with unexpected object: ${payload?.object}`
      );
      return NextResponse.json({ success: true }, { status: 200 });
    }

    const entryCount = payload.entry?.length ?? 0;
    console.log("[WEBHOOK] Processing entries", { entryCount });

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
