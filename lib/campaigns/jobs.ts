// ============================================================================
// MODULE : Campaign jobs
//
// Turns a campaign's PENDING recipients into send jobs and queues them. The one
// place a job is built, used by launch (POST /api/campaigns), resume after pause
// (PATCH /api/campaigns/[id]) and the daily safety-net cron — so all three send
// the same template, media header and per-recipient variables. (The cron used to
// rebuild jobs itself and dropped media headers and named parameters.)
// ============================================================================

import { prisma } from "@/lib/prisma";
import { publishCampaignSendBatch, type CampaignSendJob } from "@/lib/queue";
import { resolveBodyParams } from "@/lib/campaigns/templateVars";
import { rateFor } from "@/lib/wallet";
import type { RateCategory } from "@prisma/client";

/** What a campaign's `metadata` column holds about how to send it. */
export interface CampaignSendConfig {
  rateCategory?: RateCategory;
  templateName?: string;
  language: string;
  bodyVarMapping: string[];
  headerType?: CampaignSendJob["headerType"];
  headerMediaId?: string;
  headerMediaUrl?: string;
  hasOtpButton: boolean;
  templateBody?: string;
  /** Positions of the template's dynamic URL buttons, matched by `urlButtonMapping`. */
  urlButtonIndexes: number[];
  /** One mapping entry per dynamic URL button — same forms as `bodyVarMapping`. */
  urlButtonMapping: string[];
}

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

export function sendConfigFromMetadata(metadata: unknown): CampaignSendConfig {
  const m = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  return {
    rateCategory: str(m.rateCategory) as RateCategory | undefined,
    templateName: str(m.templateName),
    language: str(m.language) ?? "en",
    bodyVarMapping: Array.isArray(m.bodyVarMapping) ? (m.bodyVarMapping as unknown[]).map(String) : [],
    headerType: str(m.headerType) as CampaignSendJob["headerType"],
    headerMediaId: str(m.headerMediaId),
    headerMediaUrl: str(m.headerMediaUrl),
    hasOtpButton: m.hasOtpButton === true,
    templateBody: str(m.templateBody),
    urlButtonIndexes: Array.isArray(m.urlButtonIndexes) ? (m.urlButtonIndexes as unknown[]).map(Number).filter(Number.isInteger) : [],
    urlButtonMapping: Array.isArray(m.urlButtonMapping) ? (m.urlButtonMapping as unknown[]).map(String) : [],
  };
}

/** Imported spreadsheet columns stored on a recipient row, as strings. */
function fieldsOf(variables: unknown): Record<string, string> | null {
  if (!variables || typeof variables !== "object" || Array.isArray(variables)) return null;
  return Object.fromEntries(Object.entries(variables as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")]));
}

/**
 * Queue every PENDING recipient of a campaign, in batches.
 *
 * Values are resolved here, once, and travel on the job — a retry sends exactly
 * what the first attempt did. Duplicate jobs for a recipient (a re-queue while old
 * jobs are still in flight) are harmless: the worker claims a recipient before
 * sending, so only one job ever sends.
 */
export async function queuePendingRecipients(
  campaignId: string,
  notBefore?: Date | null,
): Promise<{ published: number; failed: number; total: number }> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      tenantId: true,
      businessId: true,
      metadata: true,
      contacts: {
        where: { status: "PENDING" },
        select: {
          id: true,
          phone: true,
          variables: true,
          contact: { select: { name: true, company: true } },
        },
      },
    },
  });
  if (!campaign) return { published: 0, failed: 0, total: 0 };

  const cfg = sendConfigFromMetadata(campaign.metadata);
  // Priced once per queueing, at the account's current rate; the worker charges exactly this.
  const unitPrice = cfg.rateCategory ? (await rateFor(campaign.tenantId, cfg.rateCategory)) ?? 0 : 0;

  const jobs: CampaignSendJob[] = campaign.contacts.map((row) => {
    const fields = fieldsOf(row.variables);
    const recipient = {
      phone: row.phone,
      // A saved contact's name, else the imported sheet's Name column — the same order the
      // dry-run preview uses (POST /api/campaigns), so the preview matches what is sent.
      name: row.contact?.name ?? fields?.Name ?? fields?.name ?? null,
      company: row.contact?.company ?? null,
      fields,
    };
    const bodyParams = resolveBodyParams(cfg.bodyVarMapping, recipient);
    // A URL suffix can't contain spaces; encode it so a value like "AB 12" stays one link.
    const urlParams = resolveBodyParams(cfg.urlButtonMapping, recipient).map((v) => encodeURIComponent(v));
    const urlButtons = cfg.urlButtonIndexes.map((index, i) => ({ index, param: urlParams[i] ?? "-" }));
    return {
      campaignId: campaign.id,
      recipientId: row.id, // CampaignContact.id — the worker looks up by it
      phone: row.phone,
      message: bodyParams.join(" / ") || cfg.templateName || "",
      businessId: campaign.businessId,
      tenantId: campaign.tenantId,
      costMinor: unitPrice,
      templateName: cfg.templateName,
      language: cfg.language,
      bodyParams: bodyParams.length ? bodyParams : undefined,
      headerType: cfg.headerType,
      headerMediaId: cfg.headerMediaId,
      headerMediaUrl: cfg.headerMediaUrl,
      hasOtpButton: cfg.hasOtpButton,
      templateBody: cfg.templateBody,
      urlButtons: urlButtons.length ? urlButtons : undefined,
    };
  });

  const { published, failed } = await publishCampaignSendBatch(jobs, notBefore ?? undefined);
  console.log("[CAMPAIGN JOBS] Queued", { campaignId, total: jobs.length, published, failed });
  return { published, failed, total: jobs.length };
}
