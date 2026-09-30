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
import { sendTextMessage, sendTemplateMessage, WABlacklistedError, type WATemplateComponent, type WATemplateParameter } from "@/lib/whatsapp";
import { detectParameterFormat, extractNamedParams } from "@/lib/templates";
import { prisma } from "@/lib/prisma";
import type { CampaignSendJob } from "@/lib/queue";
import { credit, debit, maybeAlertLowBalance } from "@/lib/wallet";

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
 * How long a claim (status SENDING) is honoured. A worker that crashed mid-send leaves its claim
 * behind; after this, a redelivery may retake it. Comfortably longer than one Meta round trip
 * plus retries, so a live send is never taken over.
 */
const CLAIM_TTL_MS = 5 * 60_000;

/**
 * Take exclusive ownership of a recipient before sending to it.
 *
 * QStash delivers at-least-once, and a recipient can also have two jobs queued (a resume or the
 * cron re-queueing while an older job is still pending). Checking "not yet SENT" is not enough —
 * two deliveries can both see PENDING and both send. The conditional update is atomic: only one
 * caller moves the row to SENDING; every other delivery sees count 0 and stands down.
 */
async function claimRecipient(recipientId: string): Promise<boolean> {
  const claimed = await prisma.campaignContact.updateMany({
    where: {
      id: recipientId,
      OR: [
        { status: "PENDING" },
        { status: "SENDING", claimedAt: { lt: new Date(Date.now() - CLAIM_TTL_MS) } },
      ],
    },
    data: { status: "SENDING", claimedAt: new Date() },
  });
  return claimed.count === 1;
}

/** Hand a claimed recipient back (a retry is coming, or the campaign is paused). */
async function releaseRecipient(recipientId: string): Promise<void> {
  await prisma.campaignContact.updateMany({
    where: { id: recipientId, status: "SENDING" },
    data: { status: "PENDING", claimedAt: null },
  });
}

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
    | { status: "SENT"; waMessageId?: string | null; costMinor?: number }
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
            waMessageId: outcome.waMessageId ?? null,
            costMinor: outcome.costMinor ?? null,
          }
        : { status: "FAILED", failedReason: outcome.reason },
  });

  if (settled.count === 0) return false;

  await prisma.campaign.update({
    where: { id: job.campaignId },
    data:
      outcome.status === "SENT"
        ? { sentCount: { increment: 1 }, costMinor: { increment: outcome.costMinor ?? 0 } }
        : { failedCount: { increment: 1 } },
  });

  return true;
}

/**
 * Give back what this recipient was charged, once — for a message that never went out.
 * Only refunds a charge that actually exists.
 */
async function refundCharge(job: CampaignSendJob): Promise<void> {
  if (!job.tenantId || !(job.costMinor && job.costMinor > 0)) return;
  const charged = await prisma.walletTransaction.findUnique({
    where: { idempotencyKey: `debit:${job.recipientId}` },
    select: { id: true },
  });
  if (!charged) return;
  await credit(job.tenantId, job.costMinor, "REFUND", {
    idempotencyKey: `refund:${job.recipientId}`,
    description: "Refund — message not sent",
    referenceType: "campaign_contact",
    referenceId: job.recipientId,
  });
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

  console.log("[WORKER CAMPAIGN-SEND] Job received", {
    campaignId: job.campaignId,
    recipientId: job.recipientId,
    phone: job.phone,
    businessId: job.businessId,
    templateName: job.templateName ?? null,
    language: job.language ?? null,
    bodyParamCount: job.bodyParams?.length ?? 0,
  });

  // Whether this delivery holds the recipient's claim — only then may it release it on failure.
  let claimed = false;

  try {
    // QStash delivers at-least-once, and a send is the one thing here that cannot be taken back.
    // A recipient that has already reached a terminal state has had its outcome decided, so a
    // redelivery must not send to it again or move its campaign's counters a second time.
    const recipient = await prisma.campaignContact.findUnique({
      where: { id: job.recipientId },
      select: { status: true, phone: true, campaignId: true, campaign: { select: { status: true } } },
    });

    if (!recipient) {
      // Classic bug: job.recipientId was Contact.id instead of CampaignContact.id — every send
      // skipped and the campaign stayed RUNNING with 0 sent. Log loudly so it shows in Vercel.
      console.error("[WORKER CAMPAIGN-SEND] CampaignContact not found — skipping (no Meta send)", {
        campaignId: job.campaignId,
        recipientId: job.recipientId,
        phone: job.phone,
        hint: "recipientId must be CampaignContact.id, not Contact.id",
      });
      return NextResponse.json({ ok: true, skipped: "recipient_missing" });
    }

    // Any terminal status, not just SENT. A recipient that has already been settled FAILED has
    // had its outcome recorded and its counter moved; sending to it again on a redelivery would
    // message a customer the campaign has already given up on, and could then settle it a second
    // time. Once a recipient is out of flight it stays out.
    if (TERMINAL_STATUSES.includes(recipient.status)) {
      console.log("[WORKER CAMPAIGN-SEND] Already settled — skip", {
        recipientId: job.recipientId,
        status: recipient.status,
      });
      return NextResponse.json({ ok: true, skipped: `already ${recipient.status}` });
    }

    const campaignStatus = recipient.campaign.status;

    // A cancelled campaign sends nothing more; its remaining recipients are closed out.
    if (campaignStatus === CampaignStatus.CANCELLED) {
      await settleRecipient(job, { status: "FAILED", reason: "Campaign was cancelled" });
      return NextResponse.json({ ok: true, skipped: "campaign cancelled" });
    }

    // A paused campaign holds its recipients PENDING. The job is acknowledged (not retried —
    // QStash would spend its retries while the pause lasts) and resuming re-queues everyone
    // still PENDING (PATCH /api/campaigns/[id]).
    if (campaignStatus === CampaignStatus.PAUSED) {
      return NextResponse.json({ ok: true, skipped: "campaign paused" });
    }

    // A scheduled campaign's jobs were queued with a delay; the first one to fire marks it as
    // sending, so the list shows RUNNING and completeIfFinished can close it out.
    if (campaignStatus === CampaignStatus.SCHEDULED) {
      await prisma.campaign.updateMany({
        where: { id: job.campaignId, status: CampaignStatus.SCHEDULED },
        data: { status: CampaignStatus.RUNNING, startedAt: new Date() },
      });
    }

    claimed = await claimRecipient(job.recipientId);
    if (!claimed) {
      console.log("[WORKER CAMPAIGN-SEND] Recipient claimed by another delivery — skip", {
        recipientId: job.recipientId,
      });
      return NextResponse.json({ ok: true, skipped: "in flight elsewhere" });
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
      console.error("[WORKER CAMPAIGN-SEND] WhatsApp not connected", {
        campaignId: job.campaignId,
        businessId: job.businessId,
        recipientId: job.recipientId,
      });
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

    // ── Wallet: charge before sending ──
    // Keyed by recipient, so a retried or redelivered job is never charged twice. When the
    // balance can't cover it, the campaign pauses; top up and Resume re-queues whoever is left.
    const charge = job.tenantId && job.costMinor && job.costMinor > 0 ? job.costMinor : 0;
    if (charge > 0) {
      const paid = await debit(job.tenantId!, charge, {
        idempotencyKey: `debit:${job.recipientId}`,
        description: `WhatsApp to +${job.phone}`,
        referenceType: "campaign_contact",
        referenceId: job.recipientId,
      });
      if (!paid.ok) {
        console.warn("[WORKER CAMPAIGN-SEND] Wallet empty — pausing campaign", { campaignId: job.campaignId });
        await prisma.campaign.updateMany({
          where: { id: job.campaignId, status: CampaignStatus.RUNNING },
          data: { status: CampaignStatus.PAUSED, lastError: "Paused: the wallet balance ran out. Top up and resume." },
        });
        await releaseRecipient(job.recipientId);
        claimed = false;
        return NextResponse.json({ ok: true, paused: "insufficient balance" });
      }
    }

    // The send is isolated in its own try so that only the send itself can be judged a send
    // failure. Anything that goes wrong after Meta has accepted the message is a bookkeeping
    // problem, and must never be mistaken for one — see the phase below.
    let sent: { messages?: { id: string }[] } | undefined;
    try {
      if (job.templateName) {
        // Template campaigns use the WhatsApp template API — the only channel Meta allows
        // for proactive (outside-24-hour-window) broadcasts.
        const components: WATemplateComponent[] = [];

        // Header component — required for media templates.
        // Prefer an uploaded media ID (no CDN needed); fall back to a public URL.
        const hasMediaHeader =
          (job.headerMediaId || job.headerMediaUrl) &&
          (job.headerType === "IMAGE" || job.headerType === "VIDEO" || job.headerType === "DOCUMENT");
        if (hasMediaHeader) {
          const mediaRef = job.headerMediaId
            ? { id: job.headerMediaId }
            : { link: job.headerMediaUrl! };
          let mediaParam: WATemplateParameter;
          if (job.headerType === "IMAGE") {
            mediaParam = { type: "image", image: mediaRef };
          } else if (job.headerType === "VIDEO") {
            mediaParam = { type: "video", video: mediaRef };
          } else {
            mediaParam = { type: "document", document: mediaRef };
          }
          components.push({ type: "header", parameters: [mediaParam] });
        }

        if (job.bodyParams?.length) {
          // Named params ({{first_name}}) require parameter_name on each parameter.
          // Positional ({{1}}) uses the ordered array as-is.
          const isNamed = job.templateBody
            ? detectParameterFormat(job.templateBody) === "NAMED"
            : false;

          if (isNamed && job.templateBody) {
            const names = extractNamedParams(job.templateBody);
            components.push({
              type: "body",
              parameters: names.map((name, i) => ({
                type: "text" as const,
                parameter_name: name,
                text: job.bodyParams![i] ?? "",
              })),
            });
          } else {
            components.push({
              type: "body",
              parameters: job.bodyParams.map((text) => ({ type: "text" as const, text })),
            });
          }
        }

        // OTP button — the first body param (the OTP code) is also passed as the copy_code button parameter.
        if (job.hasOtpButton && job.bodyParams?.[0]) {
          components.push({
            type: "button",
            sub_type: "copy_code" as const,
            index: "0",
            parameters: [{ type: "text" as const, text: job.bodyParams[0] }],
          });
        }
        console.log("[WORKER CAMPAIGN-SEND] Sending template", {
          phone: job.phone,
          templateName: job.templateName,
          language: job.language ?? "en",
          bodyParams: job.bodyParams,
        });
        sent = await sendTemplateMessage(
          creds.phoneNumberId,
          creds.apiKey,
          job.phone,
          job.templateName,
          job.language ?? "en",
          components.length ? components : undefined,
        );
      } else {
        console.log("[WORKER CAMPAIGN-SEND] Sending text", {
          phone: job.phone,
          messagePreview: job.message.slice(0, 80),
        });
        sent = await sendTextMessage(
          creds.phoneNumberId,
          creds.apiKey,
          job.phone,
          job.message,
        );
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";

      // Blacklisted (checked inside the send, before the provider): final, never retried.
      if (error instanceof WABlacklistedError) {
        console.warn("[WORKER CAMPAIGN-SEND] Recipient is blacklisted — not sent", {
          campaignId: job.campaignId,
          recipientId: job.recipientId,
        });
        await refundCharge(job);
        await settleRecipient(job, { status: "FAILED", reason: `Blacklisted: ${reason}` });
        await completeIfFinished(job.campaignId);
        return NextResponse.json({ ok: true, sent: false, blacklisted: true });
      }

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
        // Deliberately left unsettled: the claim is released so the retry can take it and
        // still succeed, and `completeIfFinished` keeps the campaign RUNNING while it does.
        // The charge stays: the retry finds it (same key) and isn't charged again.
        await releaseRecipient(job.recipientId);
        return NextResponse.json({ error: reason }, { status: 500 });
      }

      console.error(
        `[WORKER CAMPAIGN-SEND] Send to ${job.phone} failed after all ${CAMPAIGN_SEND_RETRIES + 1} attempts:`,
        reason
      );
      await refundCharge(job);
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
      const waMessageId = sent?.messages?.[0]?.id ?? null;
      console.log("[WORKER CAMPAIGN-SEND] Provider accepted — settling SENT", {
        campaignId: job.campaignId,
        recipientId: job.recipientId,
        phone: job.phone,
        waMessageId,
      });
      await settleRecipient(job, {
        status: "SENT",
        waMessageId,
        costMinor: charge,
      });
      await completeIfFinished(job.campaignId);
      if (charge > 0) await maybeAlertLowBalance(job.tenantId!);
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
    // Hand the claim back so the redelivery can take it; otherwise the recipient would sit in
    // SENDING until the claim went stale.
    if (claimed) await releaseRecipient(job.recipientId).catch(() => {});
    return NextResponse.json({ error: "Send failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
