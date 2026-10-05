
// ============================================================================
// OWNER  : Gauransh
// MODULE : Campaigns
// ROUTE  : /api/campaigns
//
// METHODS
// GET    - List the authenticated tenant's campaigns, newest first (optional ?status=)
// POST   - Create a campaign and broadcast an approved WhatsApp template to saved contacts
//          (all / selected / a segment), or to pasted phone numbers
//          (Bulk Broadcast), optionally with per-recipient data for personalised variables.
//          The wallet is checked against the estimated cost first. `dryRun: true` runs
//          every check and returns the audience, exclusions and cost without sending.
//
// ACCESS
// GET    - campaigns.view. Scoped to the active business.
// POST   - campaigns.send. Same scoping; every contact id in the body is re-verified
//          against the tenant before a single message leaves the building.
// ============================================================================
//
// A campaign is a one-to-many send. The send is the irreversible part of this module — a message
// that reaches a customer cannot be un-reached — so the route proves ownership of every recipient
// and removes everyone who must not be messaged before it dispatches anything:
//
//   · blacklisted numbers (account or platform blacklist) — always;
//   · contacts who opted out (replied STOP) — always;
//   · deleted contacts (soft-deleted: isBlocked) — when sending to saved contacts.
//
// The excluded recipients are returned with a reason so the UI can show them. The send worker and
// lib/whatsapp.ts re-check the blacklist at send time, so a number blacklisted after launch is
// still not messaged.
//
// This route does not perform the send. It writes the campaign and its recipients, then queues
// them in batches (lib/campaigns/jobs.ts); /api/workers/campaign-send sends one recipient per job.

import { NextRequest, NextResponse } from "next/server";
import { CampaignStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { guardCeiling, guardLimit } from "@/lib/billing/guard";
import { resolveTenantPlan } from "@/lib/billing/usage";
import { getBusinessScope, resolveWhatsAppCreds } from "@/lib/business";
import { analyzeNumbers, BROADCAST_MAX_NUMBERS, DEFAULT_COUNTRY_CODE } from "@/lib/broadcast";
import { findBlacklisted } from "@/lib/blacklist";
import { queuePendingRecipients } from "@/lib/campaigns/jobs";
import {
  FIELD_PREFIX,
  dynamicUrlButtons,
  hasOtpButton,
  resolveBodyParams,
  unsupportedTemplateReason,
} from "@/lib/campaigns/templateVars";
import { normalizePhone } from "@/lib/import";
import { requirePermission } from "@/lib/permissions";
import { segmentFiltersSchema } from "@/lib/segmentRules";
import { segmentWhere } from "@/lib/segments";
import { formatInr, getWallet, rateFor, whatsappCategory } from "@/lib/wallet";
import type { RateCategory } from "@prisma/client";

// Queuing a few thousand recipients in batches takes seconds, not minutes, but a cold
// database plus a large audience can pass the platform's short default.
export const maxDuration = 60;

/**
 * Columns the campaigns list actually renders.
 *
 * A `select`, not an `include`: the list draws a summary row. `filters` and `metadata` are Json
 * columns holding the campaign's audience definition and its message body — bytes the list has no
 * use for, and which would be shipped for every campaign on the page if the relation were included.
 */
const CAMPAIGN_LIST_SELECT = {
  id: true,
  name: true,
  status: true,
  costMinor: true,
  scheduledAt: true,
  totalCount: true,
  sentCount: true,
  deliveredCount: true,
  readCount: true,
  repliedCount: true,
  failedCount: true,
  templateId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CampaignSelect;

/** Most saved contacts one campaign can address — mirrors the broadcast ceiling. */
const MAX_CONTACT_IDS = 50_000;
/** Most excluded recipients listed back to the UI (the counts are always complete). */
const MAX_EXCLUDED_LISTED = 500;

/**
 * The body of a campaign being launched.
 *
 * Audience, exactly one of:
 *   · `all: true`            — every saved contact of the active business, minus `excludeContactIds`;
 *   · `contactIds`           — these saved contacts;
 *   · `numbers`              — pasted phone numbers; need not be saved contacts. `recipientFields`
 *                              optionally carries imported columns per number, for `field:` variables.
 *
 * Using a regular `z.object` rather than `z.strictObject` so older clients sending extra keys keep
 * working.
 */
const createCampaignSchema = z.object({
  name: z.string().trim().min(1, "Campaign name is required").max(200),
  templateId: z.string().min(1).optional(),
  /**
   * One entry per template body variable, in order: a contact field ("name" | "phone" |
   * "company"), an imported column ("field:Subject1"), or literal text.
   */
  bodyVarMapping: z.array(z.string().max(1000, "A variable value is too long")).max(50).default([]),
  /**
   * One entry per dynamic URL button (the link's `{{1}}`), in button order — the same
   * forms as `bodyVarMapping`.
   */
  urlButtonMapping: z.array(z.string().max(1000, "A button link value is too long")).max(10).default([]),
  /** Public URL for a media header (IMAGE / VIDEO / DOCUMENT templates). */
  headerMediaUrl: z.string().url("Header media must be a valid URL").optional(),
  /** Meta media ID from a pre-uploaded asset — alternative to headerMediaUrl. */
  headerMediaId: z.string().max(200).optional(),
  contactIds: z.array(z.string().min(1)).max(MAX_CONTACT_IDS).optional(),
  all: z.boolean().optional(),
  /** A saved customer segment: its matching contacts, worked out now (minus `excludeContactIds`). */
  segmentId: z.string().min(1).optional(),
  /** With `all`: contacts removed on the review screen. */
  excludeContactIds: z.array(z.string().min(1)).max(MAX_CONTACT_IDS).optional(),
  /** Pasted phone numbers, in any common format; normalised and de-duplicated here. */
  numbers: z
    .array(z.string().max(40))
    .max(BROADCAST_MAX_NUMBERS, `At most ${BROADCAST_MAX_NUMBERS} numbers per broadcast`)
    .optional(),
  /** Imported columns per number: { "919876543210": { "Name": "Rahul", "Subject1": "85" } }. */
  recipientFields: z
    .record(z.string().max(40), z.record(z.string().max(100), z.string().max(1000)))
    .optional(),
  /** Country code for `numbers` written without one. Digits only. */
  defaultCountryCode: z.string().regex(/^\d{0,4}$/, "Invalid country code").optional(),
  /** Run every check and report the audience without creating or sending anything. */
  dryRun: z.boolean().optional(),
  /** With `dryRun`: also return the final recipient list, for the review screen. */
  includeRecipients: z.boolean().optional(),
  scheduledAt: z.string().optional(),
});

type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

/**
 * One address a campaign will send to. `contactId` is null for a pasted number that is not a
 * saved contact — `CampaignContact.contactId` is nullable for exactly this. `fields` are the
 * recipient's imported columns, stored on `CampaignContact.variables`.
 */
interface RecipientInput {
  contactId: string | null;
  phone: string;
  name: string | null;
  company: string | null;
  fields?: Record<string, string> | null;
}

type ExclusionReason = "blacklisted" | "opted_out" | "deleted";

interface Excluded {
  phone: string;
  name: string | null;
  reason: ExclusionReason;
}

interface Audience {
  recipients: RecipientInput[];
  excluded: Excluded[];
  /** Numbers mode: pasted numbers that matched a saved contact. */
  matched?: number;
  /** Numbers mode: entries merged because they were the same number. */
  duplicates?: number;
}

type AudienceResult = { ok: false; error: string } | ({ ok: true } & Audience);

/**
 * List the tenant's campaigns, newest first.
 *
 * `tenantId` is the predicate that makes this a list rather than a leak — it is taken from the
 * session and never from the request, so there is no input a caller could supply to widen it.
 */
async function listCampaigns(tenantId: string, businessId: string, status: CampaignStatus | null) {
  return prisma.campaign.findMany({
    // Campaigns are created with the active businessId and send on that business's WhatsApp
    // number, so the list belongs to that business alone.
    where: { tenantId, businessId, ...(status && { status }) },
    select: CAMPAIGN_LIST_SELECT,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Resolve the saved-contact audience: every contact of the business (minus removals), or the
 * listed ids.
 *
 * Listed ids are proved against the tenant in one query. The count check is the security
 * boundary: `contactIds` is caller-supplied, and the tenant-scoped `IN` silently drops any id
 * belonging to another workspace — so a shortfall means a foreign (or duplicated) id, and the
 * whole request is refused rather than quietly delivered to the subset that happened to be ours.
 *
 * Deleted (isBlocked) and opted-out contacts are not errors — they are excluded and reported.
 */
async function resolveContactAudience(
  tenantId: string,
  businessId: string,
  input: CreateCampaignInput,
): Promise<AudienceResult> {
  const select = { id: true, phone: true, name: true, company: true, optedOut: true, isBlocked: true };
  let rows: { id: string; phone: string; name: string; company: string | null; optedOut: boolean; isBlocked: boolean }[];

  if (input.segmentId) {
    const segment = await prisma.segment.findFirst({
      where: { id: input.segmentId, tenantId, businessId },
      select: { filters: true },
    });
    if (!segment) return { ok: false, error: "Segment not found" };
    const parsed = segmentFiltersSchema.safeParse(segment.filters);
    if (!parsed.success) return { ok: false, error: "This segment's filters are no longer valid — edit and save it again" };
    const removed = new Set(input.excludeContactIds ?? []);
    rows = (
      await prisma.contact.findMany({ where: await segmentWhere(tenantId, businessId, parsed.data.rules), select })
    ).filter((c) => !removed.has(c.id));
    if (rows.length === 0) return { ok: false, error: "No contacts match this segment" };
  } else if (input.all) {
    const removed = new Set(input.excludeContactIds ?? []);
    rows = (
      await prisma.contact.findMany({
        // "All" means the contacts the user can see: deleted ones are not in the list at all.
        where: { tenantId, businessId, isBlocked: false },
        select,
      })
    ).filter((c) => !removed.has(c.id));
    if (rows.length === 0) return { ok: false, error: "No contacts to send to in this business" };
  } else {
    const ids = [...new Set(input.contactIds ?? [])];
    if (ids.length === 0) return { ok: false, error: "At least one contact is required" };
    rows = await prisma.contact.findMany({ where: { tenantId, id: { in: ids } }, select });
    if (rows.length !== ids.length) return { ok: false, error: "One or more contacts could not be found" };
  }

  const recipients: RecipientInput[] = [];
  const excluded: Excluded[] = [];
  for (const c of rows) {
    if (c.isBlocked) excluded.push({ phone: c.phone, name: c.name, reason: "deleted" });
    else if (c.optedOut) excluded.push({ phone: c.phone, name: c.name, reason: "opted_out" });
    else recipients.push({ contactId: c.id, phone: c.phone, name: c.name, company: c.company });
  }
  return { ok: true, recipients, excluded };
}

/**
 * Resolve pasted numbers into recipients, without requiring them to be contacts.
 *
 * The numbers are normalised and de-duplicated again here — the page already did so, but the
 * server decides who is messaged. Any entry that is not a phone number rejects the whole request
 * rather than being quietly dropped, so the count the user confirmed is the count that sends.
 *
 * A number that matches a saved contact of this business is linked to it (name/company for
 * variables, and the delivery record ties to the contact). A contact who opted out is excluded
 * whatever the pasted list says — WhatsApp policy requires honouring opt-outs, and a paste is not
 * consent. A *deleted* contact is not excluded: deleting a contact from the CRM is not a request
 * to stop messaging that number (that is what the blacklist is for).
 */
async function resolveNumberAudience(
  tenantId: string,
  businessId: string,
  input: CreateCampaignInput,
): Promise<AudienceResult> {
  const countryCode = input.defaultCountryCode ?? DEFAULT_COUNTRY_CODE;
  const analysis = analyzeNumbers(input.numbers ?? [], countryCode);
  if (analysis.invalid.length > 0) {
    const first = analysis.invalid[0];
    return {
      ok: false,
      error: `${analysis.invalid.length} number(s) are invalid, e.g. "${first.raw}" (${first.reason.toLowerCase()})`,
    };
  }
  if (analysis.valid.length === 0) return { ok: false, error: "At least one phone number is required" };

  // Imported columns, re-keyed by the normalised number so they line up with `analysis.valid`.
  const fieldsByPhone = new Map<string, Record<string, string>>();
  for (const [key, fields] of Object.entries(input.recipientFields ?? {})) {
    fieldsByPhone.set(normalizePhone(key, countryCode), fields);
  }

  const known = await prisma.contact.findMany({
    where: { tenantId, businessId, phone: { in: analysis.valid } },
    select: { id: true, phone: true, name: true, company: true, optedOut: true },
  });
  const byPhone = new Map(known.map((c) => [c.phone, c]));

  const recipients: RecipientInput[] = [];
  const excluded: Excluded[] = [];
  for (const phone of analysis.valid) {
    const contact = byPhone.get(phone);
    if (contact?.optedOut) {
      excluded.push({ phone, name: contact.name, reason: "opted_out" });
      continue;
    }
    const fields = fieldsByPhone.get(phone) ?? null;
    recipients.push({
      contactId: contact?.id ?? null,
      phone,
      // An imported "Name" column wins over nothing, but a saved contact's name is kept.
      name: contact?.name ?? fields?.Name ?? fields?.name ?? null,
      company: contact?.company ?? null,
      fields,
    });
  }

  return {
    ok: true,
    recipients,
    excluded,
    matched: recipients.filter((r) => r.contactId).length,
    duplicates: analysis.duplicates,
  };
}

/** Remove blacklisted numbers from an audience, recording each as excluded. */
async function applyBlacklist(tenantId: string, audience: Audience): Promise<Audience> {
  const hits = await findBlacklisted(tenantId, audience.recipients.map((r) => r.phone));
  if (hits.size === 0) return audience;
  return {
    ...audience,
    recipients: audience.recipients.filter((r) => !hits.has(r.phone)),
    excluded: [
      ...audience.recipients
        .filter((r) => hits.has(r.phone))
        .map((r) => ({ phone: r.phone, name: r.name, reason: "blacklisted" as const })),
      ...audience.excluded,
    ],
  };
}

/** Counts by reason plus a capped list, for the response. */
function exclusionReport(excluded: Excluded[]) {
  return {
    excludedCount: excluded.length,
    excludedByReason: {
      blacklisted: excluded.filter((e) => e.reason === "blacklisted").length,
      opted_out: excluded.filter((e) => e.reason === "opted_out").length,
      deleted: excluded.filter((e) => e.reason === "deleted").length,
    },
    excluded: excluded.slice(0, MAX_EXCLUDED_LISTED),
  };
}

/**
 * Create the campaign and its recipient rows, atomically.
 *
 * The two writes are one fact — a campaign whose recipients failed to materialise would be a live
 * RUNNING row addressed to nobody — so they commit together. `createMany` rather than a loop of
 * inserts, which would hold a connection for the length of the audience.
 *
 * `phone` is denormalised onto each recipient row deliberately: it is the address the message was
 * actually sent to, and a contact who later changes number must not rewrite a campaign's history.
 * `variables` holds the recipient's imported columns, which the job builder reads at queue time.
 *
 * An immediate campaign is created RUNNING; a scheduled one SCHEDULED with no `startedAt` — the
 * worker moves it to RUNNING when its first job fires.
 */
async function createCampaign(
  tenantId: string,
  businessId: string,
  input: CreateCampaignInput,
  recipients: RecipientInput[],
  excludedCount: number,
  scheduledAt: Date | null,
  spec: SendSpec,
  estimatedCostMinor: number,
) {
  return prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.create({
      data: {
        tenantId,
        businessId,
        name: input.name,
        templateId: spec.templateId,
        estimatedCostMinor,
        status: scheduledAt ? CampaignStatus.SCHEDULED : CampaignStatus.RUNNING,
        ...(scheduledAt ? { scheduledAt } : { startedAt: new Date() }),
        totalCount: recipients.length,
        // How the audience was chosen, for the detail view and audits. Pasted numbers are not
        // contacts, so without this a broadcast would look like a campaign whose contacts were
        // later deleted.
        filters: {
          audience: input.numbers ? "numbers" : input.segmentId ? "segment" : input.all ? "all" : "selected",
          ...(input.segmentId && !input.numbers && { segmentId: input.segmentId }),
          personalised: Boolean(input.recipientFields),
          excluded: excludedCount,
        },
        metadata: {
          ...spec.metadata,
          bodyVarMapping: input.bodyVarMapping,
          urlButtonMapping: input.urlButtonMapping,
        } as Prisma.InputJsonObject,
      },
      select: { id: true },
    });

    await tx.campaignContact.createMany({
      data: recipients.map((r) => ({
        campaignId: campaign.id,
        contactId: r.contactId,
        phone: r.phone,
        ...(r.fields && { variables: r.fields }),
      })),
    });

    return campaign;
  });
}

/**
 * What the send needs: the template, what the send worker reads from the campaign's
 * metadata, and the price category each message is charged at.
 */
interface SendSpec {
  templateId: string;
  metadata: Record<string, unknown>;
  rateCategory: RateCategory;
}

type SpecResult = { ok: false; status: number; error: string } | { ok: true; spec: SendSpec };

async function whatsappSpec(tenantId: string, businessId: string, input: CreateCampaignInput): Promise<SpecResult> {
  if (!input.templateId) return { ok: false, status: 400, error: "Please select a template" };
  const template = await prisma.messageTemplate.findFirst({
    // Business-scoped: a template approved on another business's WhatsApp account can't be
    // sent from this one's number.
    where: { id: input.templateId, tenantId, businessId },
    select: { id: true, name: true, language: true, status: true, category: true, headerType: true, headerContent: true, buttons: true, body: true },
  });
  if (!template) return { ok: false, status: 404, error: "Template not found" };
  if (template.status !== "APPROVED") {
    return { ok: false, status: 422, error: "Only APPROVED templates can be used for broadcasts" };
  }
  const unsupported = unsupportedTemplateReason(template);
  if (unsupported) return { ok: false, status: 422, error: `This template can't be broadcast. ${unsupported}` };
  const mediaHeader = template.headerType === "IMAGE" || template.headerType === "VIDEO" || template.headerType === "DOCUMENT";
  if (mediaHeader && !input.headerMediaId && !input.headerMediaUrl) {
    return { ok: false, status: 400, error: `This template needs a ${template.headerType!.toLowerCase()} header` };
  }

  const creds = await resolveWhatsAppCreds(businessId);
  if (!creds.phoneNumberId || !creds.apiKey) {
    console.warn("[CAMPAIGNS] WhatsApp not connected", { businessId });
    return { ok: false, status: 409, error: "WhatsApp is not connected for this workspace" };
  }

  // Every dynamic link needs a value, or Meta rejects each message (#132000).
  const urlButtons = dynamicUrlButtons(template);
  const urlValues = input.urlButtonMapping.slice(0, urlButtons.length);
  if (urlButtons.length && (urlValues.length < urlButtons.length || urlValues.some((v) => !v.trim()))) {
    return { ok: false, status: 400, error: `Fill in the link for the "${urlButtons[0].text}" button` };
  }

  const rateCategory = whatsappCategory(template.category);
  return {
    ok: true,
    spec: {
      templateId: template.id,
      rateCategory,
      metadata: {
        rateCategory,
        templateName: template.name,
        language: template.language,
        headerMediaUrl: input.headerMediaUrl ?? null,
        headerMediaId: input.headerMediaId ?? null,
        headerType: template.headerType ?? null,
        hasOtpButton: hasOtpButton(template),
        urlButtonIndexes: urlButtons.map((b) => b.index),
        templateBody: template.body,
      },
    },
  };
}

/**
 * Return the business's campaigns.
 */
export async function GET(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const denied = await requirePermission(scope, "campaigns.view");
  if (denied) return denied;

  const { tenantId, businessId } = scope;
  const rawStatus = new URL(req.url).searchParams.get("status");
  const status = rawStatus && rawStatus in CampaignStatus ? (rawStatus as CampaignStatus) : null;

  try {
    const campaigns = await listCampaigns(tenantId, businessId, status);
    return NextResponse.json({ success: true, data: campaigns });
  } catch (error) {
    // Prisma's errors name columns and query shapes; the caller learns only that the read failed.
    console.error("[CAMPAIGNS]", error);
    return NextResponse.json({ success: false, error: "Failed to load campaigns" }, { status: 500 });
  }
}

/**
 * Launch (or dry-run) a campaign.
 *
 * Every precondition is proved before the campaign row exists, because a campaign is the one thing in
 * this system that cannot be taken back. Creating the row first and validating afterwards would leave
 * a RUNNING campaign behind every rejected request.
 */
export async function POST(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const denied = await requirePermission(scope, "campaigns.send");
  if (denied) return denied;

  const { tenantId, businessId } = scope;

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = createCampaignSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
    }
    const input = parsed.data;

    // Imported columns only exist for pasted/imported numbers; a `field:` variable anywhere else
    // would send "-" to everyone.
    const usesFields = [...input.bodyVarMapping, ...input.urlButtonMapping].some((m) => m.startsWith(FIELD_PREFIX));
    if (usesFields && !(input.numbers && input.recipientFields)) {
      return NextResponse.json(
        { success: false, error: "Spreadsheet column variables need an imported recipient file" },
        { status: 400 },
      );
    }

    // ── Audience ──
    const resolved = input.numbers
      ? await resolveNumberAudience(tenantId, businessId, input)
      : await resolveContactAudience(tenantId, businessId, input);
    if (!resolved.ok) {
      return NextResponse.json({ success: false, error: resolved.error }, { status: 400 });
    }
    const audience = await applyBlacklist(tenantId, resolved);
    const report = {
      ...exclusionReport(audience.excluded),
      ...(audience.matched !== undefined && { matched: audience.matched }),
      ...(audience.duplicates !== undefined && { duplicates: audience.duplicates }),
    };

    if (audience.recipients.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Every recipient is blacklisted, opted out or deleted — there is no one to send to",
          data: report,
        },
        { status: 400 },
      );
    }

    // All three caps are asserted here, at launch, where the audience size is known — not per
    // recipient in the send worker, which would mark thousands FAILED for a campaign that was only
    // ever too large to start.
    const { limits, planName } = await resolveTenantPlan(tenantId);
    const overLimit =
      (await guardLimit(tenantId, "campaigns")) ??
      (await guardLimit(tenantId, "messagesPerDay", audience.recipients.length)) ??
      guardCeiling("campaignRecipients", audience.recipients.length, limits.campaignRecipients, planName);
    if (overLimit) return overLimit;

    // ── Template ──
    const specResult = await whatsappSpec(tenantId, businessId, input);
    if (!specResult.ok) {
      return NextResponse.json({ success: false, error: specResult.error }, { status: specResult.status });
    }
    const spec = specResult.spec;

    // A schedule in the future defers the send; one already past is treated as "send now". An
    // unparseable value is rejected rather than silently ignored — the alternative is a campaign
    // the user believed was scheduled going out immediately.
    let scheduledAt: Date | null = null;
    if (input.scheduledAt) {
      const parsedDate = new Date(input.scheduledAt);
      if (Number.isNaN(parsedDate.getTime())) {
        return NextResponse.json({ success: false, error: "Invalid scheduled date" }, { status: 400 });
      }
      if (parsedDate.getTime() > Date.now()) scheduledAt = parsedDate;
    }

    // ── Cost & wallet ──
    // One message per recipient. A category without a rate is free.
    const unitPrice = await rateFor(tenantId, spec.rateCategory);
    const units = audience.recipients.length;
    const estimatedCostMinor = units * (unitPrice ?? 0);
    const wallet = await getWallet(tenantId);
    const cost = {
      units,
      unitPriceMinor: unitPrice ?? 0,
      estimatedCostMinor,
      balanceMinor: wallet.balanceMinor,
    };
    if (estimatedCostMinor > wallet.balanceMinor) {
      return NextResponse.json(
        {
          success: false,
          error: `Not enough balance: this send costs about ${formatInr(estimatedCostMinor)} and the wallet has ${formatInr(wallet.balanceMinor)}. Top up to continue.`,
          data: { ...report, cost },
        },
        { status: 402 },
      );
    }

    // ── Dry run: report exactly what a launch would do, and stop ──
    if (input.dryRun) {
      const first = audience.recipients[0];
      return NextResponse.json({
        success: true,
        data: {
          total: audience.recipients.length,
          ...report,
          cost,
          scheduledAt: scheduledAt?.toISOString() ?? null,
          sample: {
            phone: first.phone,
            bodyParams: resolveBodyParams(input.bodyVarMapping, first),
            urlParams: resolveBodyParams(input.urlButtonMapping, first),
          },
          ...(input.includeRecipients && {
            recipients: audience.recipients.map((r) => ({
              contactId: r.contactId,
              phone: r.phone,
              name: r.name,
            })),
          }),
        },
      });
    }

    console.log("[CAMPAIGNS] Creating campaign", {
      tenantId,
      businessId,
      name: input.name,
      templateId: spec.templateId,
      audience: input.numbers ? "numbers" : input.segmentId ? "segment" : input.all ? "all" : "selected",
      recipients: audience.recipients.length,
      excluded: audience.excluded.length,
      estimatedCostMinor,
      scheduledAt: scheduledAt?.toISOString() ?? null,
    });

    const campaign = await createCampaign(
      tenantId,
      businessId,
      input,
      audience.recipients,
      audience.excluded.length,
      scheduledAt,
      spec,
      estimatedCostMinor,
    );

    const { published, failed } = await queuePendingRecipients(campaign.id, scheduledAt);

    if (published === 0) {
      console.error("[CAMPAIGNS] No jobs published — check QSTASH_TOKEN / NEXT_PUBLIC_APP_URL", {
        campaignId: campaign.id,
        recipientCount: audience.recipients.length,
        failed,
      });
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          status: CampaignStatus.FAILED,
          lastError: "Failed to queue any sends. Check QStash configuration.",
          completedAt: new Date(),
        },
      });
      return NextResponse.json(
        { success: false, error: "Campaign created but no messages could be queued. Check QStash / app URL config." },
        { status: 502 },
      );
    }

    // Counters start at zero: nothing has been sent yet. The worker moves sentCount/failedCount
    // as each job lands and marks the campaign COMPLETED once no recipient is still in flight.
    return NextResponse.json(
      {
        success: true,
        data: {
          campaignId: campaign.id,
          total: audience.recipients.length,
          ...report,
          cost,
          ...(scheduledAt && { scheduledAt: scheduledAt.toISOString() }),
          queued: published,
          queueFailed: failed,
          sentCount: 0,
          failedCount: 0,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    // Meta's client throws with the upstream response body embedded, which can carry account
    // identifiers and token hints — so it is logged in full and never returned to the caller.
    console.error("[CAMPAIGNS]", error);
    return NextResponse.json({ success: false, error: "Failed to create campaign" }, { status: 500 });
  }
}
