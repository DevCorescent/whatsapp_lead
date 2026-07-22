// ============================================================================
// MODULE : Campaign runner
// ============================================================================
//
// The single place a campaign is actually sent. Both the immediate-send path
// (POST /api/campaigns with sendNow, PATCH action "send_now"/"retry") and the
// background scheduler call `runCampaign` — there is no other send loop, so the
// send logic is never duplicated.
//
// Duplicate protection: runCampaign begins by ATOMICALLY claiming the campaign
// (status -> PROCESSING) with an updateMany guarded on the current status. Only
// the caller whose update actually changes a row proceeds; a concurrent claim
// (a second cron tick, a user clicking "Send Now" while the cron fires) sees a
// count of 0 and is rejected. A campaign therefore can never be sent twice.

import { CampaignStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendTextMessage } from "@/lib/whatsapp";
import { resolveWhatsAppCreds } from "@/lib/business";

/** Statuses a campaign may be in and still be eligible to start sending. */
const CLAIMABLE: CampaignStatus[] = ["DRAFT", "SCHEDULED", "FAILED", "CANCELLED"];

const DEFAULT_MESSAGE = "Hello from WhatsCRM";

export class CampaignClaimError extends Error {
  constructor(message = "Campaign is already processing or was already sent") {
    super(message);
    this.name = "CampaignClaimError";
  }
}

export interface RunCampaignResult {
  sent: number;
  failed: number;
  status: "SENT" | "FAILED";
}

/** Pull the broadcast body out of the campaign metadata JSON. */
function messageFromMetadata(metadata: unknown): string {
  if (metadata && typeof metadata === "object") {
    const m = (metadata as Record<string, unknown>).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return DEFAULT_MESSAGE;
}

/** Minimal per-recipient personalisation for the variables the UI advertises. */
function personalise(body: string, name: string | null | undefined, phone: string): string {
  return body
    .replace(/\{\{\s*name\s*\}\}/gi, name?.trim() || "there")
    .replace(/\{\{\s*phone\s*\}\}/gi, phone);
}

/**
 * Send a campaign. Atomically claims it (-> PROCESSING), sends to every PENDING
 * recipient reusing the WhatsApp client, then records the outcome:
 *   success -> SENT   (+ sentAt, sentCount, failedCount, lastError cleared)
 *   fatal   -> FAILED (+ lastError)
 *
 * Per-recipient failures are recorded on the CampaignContact rows and counted,
 * but do not by themselves fail the whole campaign — a campaign is only FAILED
 * when it cannot send at all (missing credentials, or an unexpected exception).
 *
 * @throws {CampaignClaimError} if the campaign could not be claimed (already
 *   PROCESSING/SENT, or concurrently claimed elsewhere).
 */
export async function runCampaign(campaignId: string): Promise<RunCampaignResult> {
  const now = new Date();

  // ── Atomic claim ──────────────────────────────────────────────────────────
  const claim = await prisma.campaign.updateMany({
    where: { id: campaignId, status: { in: CLAIMABLE } },
    data: { status: "PROCESSING", processedAt: now, startedAt: now, lastError: null },
  });
  if (claim.count === 0) {
    throw new CampaignClaimError();
  }

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, tenantId: true, businessId: true, metadata: true },
    });
    if (!campaign) throw new Error("Campaign not found after claim");

    // Credentials come from the campaign's OWN business — each business sends from
    // its own WhatsApp number — with a fallback to the tenant's legacy settings.
    const creds = await resolveWhatsAppCreds(campaign.businessId);

    if (!creds.phoneNumberId || !creds.apiKey) {
      return await markFailed(campaignId, "WhatsApp is not connected for this business. Add credentials in the business settings.");
    }

    const phoneNumberId = creds.phoneNumberId;
    const apiKey = creds.apiKey;
    const body = messageFromMetadata(campaign.metadata);

    const pending = await prisma.campaignContact.findMany({
      where: { campaignId, status: "PENDING" },
      include: { contact: { select: { name: true, phone: true } } },
    });

    let sent = 0;
    let failed = 0;
    let lastFailure: string | null = null;

    for (const cc of pending) {
      const phone = cc.contact?.phone ?? cc.phone;
      try {
        await sendTextMessage(phoneNumberId, apiKey, phone, personalise(body, cc.contact?.name, phone));
        await prisma.campaignContact.update({
          where: { id: cc.id },
          data: { status: "SENT", sentAt: new Date() },
        });
        sent++;
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : "Send failed";
        await prisma.campaignContact.update({
          where: { id: cc.id },
          data: { status: "FAILED", failedReason: lastFailure },
        });
        failed++;
      }
    }

    // Nothing could be delivered — treat the whole run as failed so the operator
    // can retry, rather than silently reporting a "sent" campaign that sent nothing.
    if (sent === 0 && failed > 0) {
      return await markFailed(campaignId, lastFailure ?? "All messages failed to send", sent, failed);
    }

    const completedAt = new Date();
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: "SENT",
        sentAt: completedAt,
        completedAt,
        sentCount: sent,
        failedCount: failed,
        lastError: null,
      },
    });

    return { sent, failed, status: "SENT" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Campaign failed to send";
    return await markFailed(campaignId, message);
  }
}

async function markFailed(
  campaignId: string,
  message: string,
  sent = 0,
  failed = 0,
): Promise<RunCampaignResult> {
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: "FAILED",
      lastError: message.slice(0, 1000),
      completedAt: new Date(),
      ...(sent > 0 && { sentCount: sent }),
      ...(failed > 0 && { failedCount: failed }),
    },
  });
  return { sent, failed, status: "FAILED" };
}
