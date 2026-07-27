// ============================================================================
// MODULE : Queue (Upstash QStash)
// ============================================================================
//
// The single QStash publishing boundary in the application. Nothing outside this
// file may import `@upstash/qstash` to publish — routes reach the queue only
// through the typed publishers below, so the job vocabulary, the worker URLs and
// the retry policy are all decided in exactly one place.
//
// The queue exists because Meta gives the webhook a few seconds to answer and
// treats anything slower as a failed delivery — which it then retries, putting a
// second AI reply in front of the customer. Publishing a job is one HTTP call;
// the DB writes, the model call and the Meta send all move behind it, off the
// request Meta is waiting on.
//
// QStash delivers at-least-once and calls the worker back over plain HTTP, so a
// job body must carry everything the worker needs to re-resolve its own context —
// ids, not loaded rows — and every worker must be idempotent. See the worker
// routes under app/api/workers/ for how each one earns that.

import { Client } from "@upstash/qstash";
import type { WAMessage } from "@/types";

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

/** The public URL of this deployment. Workers are called via HTTP by QStash. */
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://whatsapp-lead-five.vercel.app";

// ─── Job types ────────────────────────────────────────────────────────────────

/**
 * One inbound WhatsApp message, handed from the webhook to the inbound worker.
 *
 * `rawMessage` is the payload the ingestion pipeline actually consumes — it is
 * typed as the existing `WAMessage` rather than `unknown` so the worker can pass
 * it straight to `processIncomingMessage` without a cast. The flattened fields
 * alongside it are what make a queued job readable on its own in the QStash
 * console when a delivery has to be diagnosed after the fact.
 */
export interface InboundMessageJob {
  tenantId: string;
  businessId: string;
  phoneNumberId: string;
  waMessageId: string;
  from: string;
  contactName?: string;
  type: string;
  content: string | null;
  timestamp: string;
  rawMessage: WAMessage;
}

export interface AiReplyJob {
  tenantId: string;
  businessId: string;
  conversationId: string;
  contactPhone: string;
  /**
   * Meta's id for the inbound message this reply answers.
   *
   * Carried so the worker can recognise a job it has already acted on. QStash delivers
   * at-least-once, and sending is not something that can be undone — this is what lets a
   * redelivery be identified and dropped instead of putting a second reply in front of the
   * customer. See the idempotency guard in app/api/workers/ai-reply.
   */
  waMessageId: string;
}

/**
 * One knowledge document waiting to be chunked, embedded and indexed.
 *
 * The job carries ids only. The extracted text is already on `KnowledgeDoc.content` by the time
 * this is published — extraction needs the uploaded bytes, which do not survive the request on a
 * serverless deployment, so it stays on the request path while everything after it moves here.
 * That also keeps the job body small: a 10 MB document would not fit in a QStash message.
 */
export interface KnowledgeIngestJob {
  tenantId: string;
  businessId: string;
  docId: string;
}

export interface CampaignSendJob {
  campaignId: string;
  recipientId: string;    // CampaignContact.id
  phone: string;
  /**
   * The exact text to send, fully resolved at publish time.
   *
   * Templates are synced on their own daily schedule and are never read on the send path. This
   * field is what enforces that: whatever a campaign's body is derived from is resolved once,
   * when the campaign is created, and then travels with the job. A worker therefore performs no
   * template lookup on the first attempt and none on any retry — every delivery of a given job
   * sends byte-identical text, and a template that changes mid-campaign cannot make one
   * recipient's retry disagree with their first attempt.
   *
   * A future daily sync changes only where this string is resolved from; the send path stays as
   * it is and needs no knowledge of templates at all.
   */
  message: string;
  businessId: string;
}

// ─── Publishers ───────────────────────────────────────────────────────────────

/**
 * Enqueue one inbound WhatsApp message for background processing.
 * The webhook calls this and returns 200 immediately.
 */
export async function publishInboundMessage(job: InboundMessageJob) {
  return qstash.publishJSON({
    url: `${APP_URL}/api/workers/inbound`,
    body: job,
    retries: 3,
  });
}

/**
 * Enqueue an AI auto-reply for a conversation.
 * Called by the inbound worker after saving the message.
 */
export async function publishAiReply(job: AiReplyJob, delaySeconds = 0) {
  return qstash.publishJSON({
    url: `${APP_URL}/api/workers/ai-reply`,
    body: job,
    delay: delaySeconds,   // honours autoReplyDelay setting
    retries: 2,
  });
}

/**
 * Enqueue the indexing of one knowledge document.
 *
 * The upload route publishes this and returns 201 immediately, so the user is not held for the
 * embedding calls — the dominant cost, measured at roughly 66ms per chunk before batching.
 */
export async function publishKnowledgeIngest(job: KnowledgeIngestJob) {
  return qstash.publishJSON({
    url: `${APP_URL}/api/workers/knowledge-ingest`,
    body: job,
    retries: 2,
  });
}

/**
 * Enqueue one campaign recipient send.
 * Called per-recipient so each send is individually retryable.
 */
export async function publishCampaignSend(
  job: CampaignSendJob,
  notBefore?: Date   // pass scheduledAt for scheduled campaigns
) {
  return qstash.publishJSON({
    url: `${APP_URL}/api/workers/campaign-send`,
    body: job,
    notBefore: notBefore ? Math.floor(notBefore.getTime() / 1000) : undefined,
    retries: 3,
  });
}
