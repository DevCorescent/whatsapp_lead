// ============================================================================
// OWNER  : Gauransh
// MODULE : Campaign send worker
// ROUTE  : /api/workers/campaign-send
//
// METHODS
// POST   - Send one campaign recipient's message, delivered by QStash
//
// ACCESS
// POST   - Public. Authenticated by the `upstash-signature` header, verified against
//          the QStash signing keys. Unsigned requests are refused with 401.
// ============================================================================
//
// One job per recipient. The sequential loop this replaces held the HTTP request open for the
// whole broadcast — a thousand-contact campaign meant a thousand Meta round trips before the
// caller heard anything, and a serverless timeout mid-loop left the campaign half sent with no
// way to resume. Fanning out per recipient makes each send individually retryable and removes
// the request-path ceiling on audience size entirely.
//
// A failed send is retried before it is believed. Meta rejects for transient reasons — rate
// limits, 5xx, a momentary timeout — and the loop this replaces gave a recipient exactly one
// attempt, so those recipients were recorded FAILED and never reached. Answering non-2xx asks
// QStash to redeliver, up to the `retries` set on the job; only the final delivery writes the
// FAILED outcome, so a recipient is not declared undeliverable until every attempt is spent.
//
// The counters are the subtle part. `failedCount` must move once per recipient, not once per
// attempt, and a redelivery of an already-settled job must not move it at all — so every
// terminal write goes through a status-guarded `updateMany` and the campaign counter is only
// touched when that update actually matched a row. See settleRecipient.

import { NextRequest, NextResponse } from "next/server";
import { CampaignStatus } from "@prisma/client";
import { verifyQStashSignature } from "@/lib/qstash-verify";
import { cachedBusinessCreds } from "@/lib/cache";
import { resolveWhatsAppCreds } from "@/lib/business";
import { sendTextMessage, sendTemplateMessage, type WATemplateComponent } from "@/lib/whatsapp";
import { prisma } from "@/lib/prisma";
import type { CampaignSendJob } from "@/lib/queue";

/**
 * How many redeliveries QStash will attempt, which must match the `retries` that
 * `publishCampaignSend` sets on the job.
 *
 * QStash sends `Upstash-Retried` with every delivery — "how often the message has been retried
 * so far", counting from 0 — so the first attempt carries 0 and the last carries this value.
 * That is how a worker knows it is out of attempts and must record the outcome rather than ask
 * for another one. If the two numbers ever drift apart, a recipient is either settled early or
 * never settled at all, so they belong together.
 */
const CAMPAIGN_SEND_RETRIES = 3;

/** Terminal states a recipient can be settled into; anything else is still in flight. */
const TERMINAL_STATUSES = ["SENT", "FAILED"];

/**
 * Record a recipient's final outcome exactly once, and move the campaign counter with it.
 *
 * Both halves are conditional on the same guard. The `updateMany` matches only a recipient that
 * has not already settled, so a redelivered or racing job updates nothing — and because the
 * campaign counter is incremented only when that match actually happened, `sentCount` and
 * `failedCount` cannot drift above the number of recipients no matter how many times QStash
 * delivers the job. A plain `update` could not express this: it would overwrite the row and
 * increment again on every delivery.
 *
 * @returns Whether this call was the one that settled the recipient.
 */
async function settleRecipient(
  job: CampaignSendJob,
  outcome:
    | { status: "SENT"; waMessageId: string | null }
    | { status: "FAILED"; reason: string }
): Promise<boolean> {
  const settled = await prisma.campaignContact.updateMany({
    where: { id: job.recipientId, status: { notIn: TERMINAL_STATUSES } },
    data:
      outcome.status === "SENT"
        ? {
            status: "SENT",
            sentAt: new Date(),
            // Meta's id for this send. Delivery receipts arrive keyed by it, so storing it here is
            // what lets the webhook attribute a `delivered`/`read` callback back to this recipient.
            waMessageId: outcome.waMessageId,
          }
        : { status: "FAILED", failedReason: outcome.reason },
  });

  if (settled.count === 0) return false;

  await prisma.campaign.update({
    where: { id: job.campaignId },
    data:
      outcome.status === "SENT"
        ? { sentCount: { increment: 1 } }
        : { failedCount: { increment: 1 } },
  });

  return true;
}

/**
 * Close the campaign out once no recipient is still waiting.
 *
 * The loop this replaces knew when it had finished; a fan-out does not, so the last job to land
 * is the one that has to notice. Guarded on RUNNING via `updateMany` rather than read-then-write:
 * several final jobs can observe an empty pending set concurrently, and only the first update
 * matches, so the campaign is completed exactly once with no transaction held across the send.
 */
async function completeIfFinished(campaignId: string): Promise<void> {
  const pending = await prisma.campaignContact.count({
    where: { campaignId, status: { notIn: TERMINAL_STATUSES } },
  });

  if (pending > 0) return;

  await prisma.campaign.updateMany({
    where: { id: campaignId, status: CampaignStatus.RUNNING },
    data: { status: CampaignStatus.COMPLETED, completedAt: new Date() },
  });
}

export async function POST(req: NextRequest) {
  const valid = await verifyQStashSignature(req);
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const job = (await req.json()) as CampaignSendJob;

  try {
    // QStash delivers at-least-once, and a send is the one thing here that cannot be taken back.
    // A recipient that has already reached a terminal state has had its outcome decided, so a
    // redelivery must not send to it again or move its campaign's counters a second time.
    const recipient = await prisma.campaignContact.findUnique({
      where: { id: job.recipientId },
      select: { status: true },
    });

    if (!recipient) {
      console.warn(
        `[WORKER CAMPAIGN-SEND] Recipient ${job.recipientId} no longer exists — skipping`
      );
      return NextResponse.json({ ok: true });
    }

    // Any terminal status, not just SENT. A recipient that has already been settled FAILED has
    // had its outcome recorded and its counter moved; sending to it again on a redelivery would
    // message a customer the campaign has already given up on, and could then settle it a second
    // time. Once a recipient is out of flight it stays out.
    if (TERMINAL_STATUSES.includes(recipient.status)) {
      return NextResponse.json({ ok: true, skipped: `already ${recipient.status}` });
    }

    const creds = await cachedBusinessCreds(job.businessId, async () => {
      const resolved = await resolveWhatsAppCreds(job.businessId);
      // The cache stores a usable pair or nothing: a half-configured workspace must not be
      // remembered as configured for the next five minutes.
      return resolved.phoneNumberId && resolved.apiKey
        ? { phoneNumberId: resolved.phoneNumberId, apiKey: resolved.apiKey }
        : null;
    });

    if (!creds) {
      // Settled immediately rather than retried. A workspace with no connected number will not
      // acquire one in the seconds between redeliveries, so spending attempts on it only delays
      // the outcome — and reporting a send that never happened is worse than reporting the
      // failure. This matches how the cron path records the same condition.
      await settleRecipient(job, {
        status: "FAILED",
        reason: "WhatsApp is not connected for this workspace",
      });
      await completeIfFinished(job.campaignId);

      return NextResponse.json({ ok: true, sent: false });
    }

    // The send is isolated in its own try so that only the send itself can be judged a send
    // failure. Anything that goes wrong after Meta has accepted the message is a bookkeeping
    // problem, and must never be mistaken for one — see the phase below.
    let sent;
    try {
      if (job.templateName) {
        // Template campaigns use the WhatsApp template API — the only channel Meta allows
        // for proactive (outside-24-hour-window) broadcasts.
        const components: WATemplateComponent[] = [];
        if (job.bodyParams?.length) {
          components.push({
            type: "body",
            parameters: job.bodyParams.map((text) => ({ type: "text" as const, text })),
          });
        }
        sent = await sendTemplateMessage(
          creds.phoneNumberId,
          creds.apiKey,
          job.phone,
          job.templateName,
          job.language ?? "en",
          components.length ? components : undefined,
        );
      } else {
        sent = await sendTextMessage(
          creds.phoneNumberId,
          creds.apiKey,
          job.phone,
          job.message,
        );
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";

      // "How often the message has been retried so far", counting from 0 — so the first delivery
      // reports 0 and the last reports CAMPAIGN_SEND_RETRIES. A missing or unparseable header is
      // read as "no more attempts": without it we cannot know whether another delivery is coming,
      // and leaving the recipient PENDING forever is a worse failure than recording it early.
      // An empty header is treated as absent rather than as zero: `Number("")` is 0, which would
      // read a missing count as "first attempt" and keep asking for retries that never settle the
      // recipient, leaving it PENDING and its campaign RUNNING forever.
      const retriedHeader = req.headers.get("upstash-retried");
      const retried =
        retriedHeader === null || retriedHeader.trim() === ""
          ? Number.NaN
          : Number(retriedHeader);
      const attemptsRemain =
        Number.isFinite(retried) && retried < CAMPAIGN_SEND_RETRIES;

      if (attemptsRemain) {
        console.warn(
          `[WORKER CAMPAIGN-SEND] Send to ${job.phone} failed (attempt ${retried + 1} of ${CAMPAIGN_SEND_RETRIES + 1}), asking QStash to retry:`,
          reason
        );
        // Deliberately left unsettled: the recipient stays PENDING so the retry can still
        // succeed, and `completeIfFinished` keeps the campaign RUNNING while it does.
        return NextResponse.json({ error: reason }, { status: 500 });
      }

      console.error(
        `[WORKER CAMPAIGN-SEND] Send to ${job.phone} failed after all ${CAMPAIGN_SEND_RETRIES + 1} attempts:`,
        reason
      );
      await settleRecipient(job, { status: "FAILED", reason });
      await completeIfFinished(job.campaignId);

      return NextResponse.json({ ok: true, sent: false });
    }

    // The message has left for Meta. From here nothing may answer non-2xx: a redelivery would
    // send a second copy to a customer who already has the first, and the recipient is still
    // PENDING at this point so the guard above would not catch it. A failure to record the
    // outcome is a reporting problem — the campaign's counters undercount — and that is strictly
    // better than messaging someone twice. Contained here rather than in the outer catch, which
    // is reserved for pre-send failures where a retry is genuinely safe.
    try {
      await settleRecipient(job, {
        status: "SENT",
        waMessageId: sent.messages?.[0]?.id ?? null,
      });
      await completeIfFinished(job.campaignId);
    } catch (error) {
      console.error(
        `[WORKER CAMPAIGN-SEND] Sent to ${job.phone} but could not record the outcome for ${job.recipientId}; not retrying:`,
        error
      );
      return NextResponse.json({ ok: true, recorded: false });
    }
  } catch (error) {
    // Reached only for failures before the send — the recipient lookup, the credential resolve,
    // or a settle on a path where nothing left the building — so a retry cannot duplicate a
    // message and is what we ask for. Meta's client throws with the upstream response body
    // embedded, which can carry account identifiers and token hints, so it is logged in full and
    // never returned to the caller.
    console.error(
      `[WORKER CAMPAIGN-SEND] Failed to process recipient ${job.recipientId}:`,
      error
    );
    return NextResponse.json({ error: "Send failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
