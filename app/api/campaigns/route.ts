
// ============================================================================
// OWNER  : Gauransh
// MODULE : Campaigns
// ROUTE  : /api/campaigns
//
// METHODS
// GET    - List the authenticated tenant's campaigns, newest first
// POST   - Create a campaign and broadcast it to the selected contacts
//
// ACCESS
// GET    - Authenticated. Scoped to session.user.tenantId.
// POST   - Authenticated. Same scoping; every contact id in the body is re-verified
//          against the tenant before a single message leaves the building.
// ============================================================================
//
// A campaign is a one-to-many send over contacts the webhook already created. The send is the
// irreversible part of this module — a message that reaches a customer cannot be un-reached — so the
// route proves ownership of every recipient before it dispatches anything.
//
// This route no longer performs the send. It proves the preconditions, writes the campaign and its
// recipients, and publishes one QStash job per recipient; /api/workers/campaign-send does the
// sending. The loop that used to run here held the HTTP request open for the entire broadcast, so a
// large audience met the serverless timeout mid-way and left the campaign permanently RUNNING and
// half sent, with no way to resume. One job per recipient makes each send individually retryable and
// removes the request-path ceiling on audience size.
//
// `Campaign` has no body column (it models `templateId`, not free text), so the broadcast text is
// stored in the `metadata` Json column the schema provides for exactly this, and travels to the
// worker on the job — resolved once here, never re-read on a retry.

import { NextRequest, NextResponse } from "next/server";
import { CampaignStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { guardCeiling, guardLimit } from "@/lib/billing/guard";
import { resolveTenantPlan } from "@/lib/billing/usage";
import { getBusinessScope, resolveWhatsAppCreds } from "@/lib/business";
import { publishCampaignSend, type CampaignSendJob } from "@/lib/queue";

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

/**
 * The body of a campaign being launched.
 *
 * Accepts either an explicit `contactIds` list or `all: true` (send to all active
 * contacts for the business). Using a regular `z.object` rather than `z.strictObject`
 * so that the UI can send either form without triggering schema validation failures.
 */
const createCampaignSchema = z.object({
  name: z.string().min(1, "Campaign name is required"),
  templateId: z.string().min(1, "Please select a template"),
  /**
   * Maps each template body variable position to a contact field.
   * Index 0 → {{1}}, index 1 → {{2}}, etc.
   * Accepted values: "name" | "phone" | "company" | any literal string.
   */
  bodyVarMapping: z.array(z.string()).default([]),
  /** Public URL for a media header (IMAGE / VIDEO / DOCUMENT templates). */
  headerMediaUrl: z.string().url("Header media must be a valid URL").optional(),
  contactIds: z.array(z.string().min(1)).optional(),
  all: z.boolean().optional(),
  scheduledAt: z.string().optional(),
});

type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

/** A recipient row with per-contact data for template variable resolution. */
interface CampaignRecipient {
  id: string;
  phone: string;
  name: string | null;
  company: string | null;
}

/**
 * List the tenant's campaigns, newest first.
 *
 * `tenantId` is the predicate that makes this a list rather than a leak — it is taken from the
 * session and never from the request, so there is no input a caller could supply to widen it.
 */
async function listCampaigns(tenantId: string, businessId: string) {
  return prisma.campaign.findMany({
    // Campaigns are created with the active businessId and send on that business's WhatsApp
    // number, so the list belongs to that business alone.
    where: { tenantId, businessId },
    select: CAMPAIGN_LIST_SELECT,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Resolve the requested contacts, proving every one of them belongs to this tenant.
 *
 * One query for the whole audience, not one per id: a campaign addressed to a thousand contacts must
 * not issue a thousand lookups, and `IN (...)` over the `(tenantId)` index answers the question in a
 * single scan.
 *
 * The count check is the security boundary. `contactIds` is caller-supplied, and the tenant-scoped
 * `IN` will silently *drop* any id belonging to another workspace rather than error — so a partial
 * match is how a cross-tenant id announces itself. Returning null on any shortfall means a campaign
 * containing one foreign id is rejected in full rather than quietly delivered to the subset that
 * happened to be ours. Duplicate ids in the request collapse in the result set and would also short
 * the count, which is the correct outcome: a duplicated recipient is a malformed audience.
 */
async function resolveContacts(
  tenantId: string,
  contactIds: string[]
): Promise<{ id: string; phone: string; name: string | null; company: string | null }[] | null> {
  const contacts = await prisma.contact.findMany({
    where: { tenantId, id: { in: contactIds } },
    select: { id: true, phone: true, name: true, company: true },
  });

  if (contacts.length !== contactIds.length) return null;

  return contacts;
}

/**
 * Create the campaign and its recipient rows, atomically.
 *
 * The two writes are one fact — a campaign whose recipients failed to materialise would be a live
 * RUNNING row addressed to nobody, and recipients without a campaign are orphans the cascade cannot
 * even reach — so they commit together. This is the only transaction in the module.
 *
 * The recipients are written with `createMany`: a loop of inserts would pay a round trip per contact
 * inside an open transaction, holding a connection for the length of the audience.
 *
 * `phone` is denormalised onto each recipient row deliberately. It is the address the message was
 * actually sent to, and a contact who later changes their number must not rewrite the history of a
 * campaign that already went out.
 *
 * The message body lives in `metadata` because `Campaign` models `templateId`, not free text. The
 * Json column is the schema's provision for payloads it does not have a column for; inventing one
 * would be a schema change.
 *
 * An immediate campaign is created RUNNING rather than DRAFT: by the time this returns, the send loop
 * is about to begin, and a row that claimed DRAFT while messages were leaving would be untrue for the
 * entire duration of the send. A scheduled one is created SCHEDULED with no `startedAt`, which is the
 * state /api/cron/campaigns selects on — nothing has started, and nothing should until the due date.
 */
async function createCampaign(
  tenantId: string,
  businessId: string,
  input: CreateCampaignInput,
  contacts: { id: string; phone: string; name: string | null; company: string | null }[],
  scheduledAt: Date | null,
  templateName: string,
  language: string,
  headerMediaUrl?: string | null,
  headerType?: string | null,
) {
  return prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.create({
      data: {
        tenantId,
        businessId,
        name: input.name,
        templateId: input.templateId,
        status: scheduledAt ? CampaignStatus.SCHEDULED : CampaignStatus.RUNNING,
        ...(scheduledAt ? { scheduledAt } : { startedAt: new Date() }),
        totalCount: contacts.length,
        metadata: { templateName, language, bodyVarMapping: input.bodyVarMapping, headerMediaUrl: headerMediaUrl ?? null, headerType: headerType ?? null },
      },
      select: { id: true },
    });

    await tx.campaignContact.createMany({
      data: contacts.map((contact) => ({
        campaignId: campaign.id,
        contactId: contact.id,
        phone: contact.phone,
      })),
    });

    // createMany does not return ids — reload so QStash jobs carry CampaignContact.id
    // (the worker looks up by that id; publishing Contact.id made every send skip silently).
    const recipients = await tx.campaignContact.findMany({
      where: { campaignId: campaign.id },
      select: { id: true, phone: true, contactId: true },
    });

    return { campaign, recipients };
  });
}

/**
 * Hand every recipient to the queue, one job each.
 *
 * Published sequentially rather than with `Promise.all`: this is a loop of HTTP calls to QStash, and
 * firing a thousand at once would rate-limit the publish itself. It is not the send rate limiter —
 * that concern now belongs to the worker, which receives one message per job.
 *
 * The message text is resolved once, here, and travels on each job. Nothing is re-read at send time,
 * so a retry of any recipient sends byte-identical text to the first attempt.
 */
const CONTACT_FIELD: Record<string, (r: CampaignRecipient) => string> = {
  name: (r) => r.name ?? "",
  phone: (r) => r.phone,
  company: (r) => r.company ?? "",
};

async function publishCampaign(
  campaignId: string,
  businessId: string,
  templateName: string,
  language: string,
  bodyVarMapping: string[],
  headerMediaUrl: string | undefined | null,
  headerType: string | undefined | null,
  /** CampaignContact rows — `id` must be CampaignContact.id, not Contact.id */
  campaignContacts: { id: string; phone: string; contactId: string | null }[],
  contactsById: Map<string, CampaignRecipient>,
  scheduledAt?: Date | null,
): Promise<{ published: number; failed: number }> {
  let published = 0;
  let failed = 0;

  console.log("[CAMPAIGNS] Publishing jobs", {
    campaignId,
    businessId,
    templateName,
    language,
    recipientCount: campaignContacts.length,
    scheduledAt: scheduledAt?.toISOString() ?? null,
  });

  for (const row of campaignContacts) {
    const contact = row.contactId ? contactsById.get(row.contactId) : undefined;
    const recipient: CampaignRecipient = contact ?? {
      id: row.contactId ?? row.id,
      phone: row.phone,
      name: null,
      company: null,
    };

    // Meta rejects empty template parameters — never send "".
    const bodyParams = bodyVarMapping.map((field) => {
      const raw = CONTACT_FIELD[field] ? CONTACT_FIELD[field](recipient) : field;
      return raw.trim() || "-";
    });
    const message = bodyParams.join(" / ") || templateName;

    try {
      const result = await publishCampaignSend(
        {
          campaignId,
          recipientId: row.id, // CampaignContact.id — required by the worker
          phone: row.phone,
          message,
          businessId,
          templateName,
          language,
          bodyParams: bodyParams.length ? bodyParams : undefined,
          headerType: (headerType as CampaignSendJob["headerType"]) ?? undefined,
          headerMediaUrl: headerMediaUrl ?? undefined,
        },
        scheduledAt ?? undefined,
      );
      published += 1;
      console.log("[CAMPAIGNS] Job published", {
        campaignId,
        campaignContactId: row.id,
        phone: row.phone,
        qstashMessageId: result.messageId,
      });
    } catch (error) {
      failed += 1;
      console.error("[CAMPAIGNS] Failed to publish job", {
        campaignId,
        campaignContactId: row.id,
        phone: row.phone,
        error,
      });
    }
  }

  console.log("[CAMPAIGNS] Publish finished", { campaignId, published, failed });
  return { published, failed };
}

/**
 * Return the tenant's campaigns.
 */
export async function GET() {
  const scope = await getBusinessScope();
  if (!scope) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { tenantId, businessId } = scope;

  try {
    const campaigns = await listCampaigns(tenantId, businessId);

    return NextResponse.json({ success: true, data: campaigns });
  } catch (error) {
    // Prisma's errors name columns and query shapes; the caller learns only that the read failed.
    console.error("[CAMPAIGNS]", error);

    return NextResponse.json(
      { success: false, error: "Failed to load campaigns" },
      { status: 500 }
    );
  }
}

/**
 * Launch a campaign.
 *
 * Every precondition is proved before the campaign row exists, because a campaign is the one thing in
 * this system that cannot be taken back: the audience is ours, and WhatsApp is connected. Creating
 * the row first and validating afterwards would leave a RUNNING campaign behind every rejected
 * request.
 *
 * The send loop runs on the request path and the response waits for it. That is the flow this module
 * was specified to have, and it is honest about what happened — but see the note below the handler:
 * it does not survive a large audience.
 */
export async function POST(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { tenantId, businessId } = scope;

  try {
    const parsed = createCampaignSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const input = parsed.data;

    let contactIdList: string[];
    if (input.all) {
      const allContacts = await prisma.contact.findMany({
        where: { tenantId, businessId },
        select: { id: true },
      });
      contactIdList = allContacts.map((c) => c.id);
      if (contactIdList.length === 0) {
        return NextResponse.json(
          { success: false, error: "No contacts in this business" },
          { status: 400 }
        );
      }
    } else {
      if (!input.contactIds?.length) {
        return NextResponse.json(
          { success: false, error: "At least one contact is required" },
          { status: 400 }
        );
      }
      contactIdList = input.contactIds;
    }

    const contacts = await resolveContacts(tenantId, contactIdList);
    if (!contacts) {
      return NextResponse.json(
        { success: false, error: "One or more contacts could not be found" },
        { status: 400 }
      );
    }

    // All three caps are asserted here, at launch, where the audience size is
    // known — not per recipient in the send worker. The worker settles each
    // recipient terminally, so refusing there would mark thousands of customers
    // FAILED for a campaign that was only ever too large to start; refusing here
    // leaves the campaign uncreated and the audience intact.
    const { limits, planName } = await resolveTenantPlan(tenantId);
    const overLimit =
      (await guardLimit(tenantId, "campaigns")) ??
      (await guardLimit(tenantId, "messagesPerDay", contacts.length)) ??
      guardCeiling("campaignRecipients", contacts.length, limits.campaignRecipients, planName);
    if (overLimit) return overLimit;

    console.log("[CAMPAIGNS] Creating campaign", {
      tenantId,
      businessId,
      name: input.name,
      templateId: input.templateId,
      audience: input.all ? "all" : "selected",
      contactCount: contacts.length,
      scheduledAt: input.scheduledAt ?? null,
    });

    // Verify the template belongs to this tenant and is approved.
    const template = await prisma.messageTemplate.findFirst({
      where: { id: input.templateId, tenantId },
      select: { id: true, name: true, language: true, status: true, headerType: true },
    });
    if (!template) {
      return NextResponse.json(
        { success: false, error: "Template not found" },
        { status: 404 },
      );
    }
    if (template.status !== "APPROVED") {
      return NextResponse.json(
        { success: false, error: "Only APPROVED templates can be used for broadcasts" },
        { status: 422 },
      );
    }

    const creds = await resolveWhatsAppCreds(businessId);
    if (!creds.phoneNumberId || !creds.apiKey) {
      console.warn("[CAMPAIGNS] WhatsApp not connected", { businessId });
      return NextResponse.json(
        {
          success: false,
          error: "WhatsApp is not connected for this workspace",
        },
        { status: 409 }
      );
    }

    // A schedule in the future defers the send; one already past is treated as "send now", which is
    // what a user who picked a moment that has since elapsed means. An unparseable value is rejected
    // rather than silently ignored — the alternative is a campaign the user believed was scheduled
    // going out immediately to the whole audience, which is not a recoverable mistake.
    let scheduledAt: Date | null = null;
    if (input.scheduledAt) {
      const parsedDate = new Date(input.scheduledAt);
      if (Number.isNaN(parsedDate.getTime())) {
        return NextResponse.json(
          { success: false, error: "Invalid scheduled date" },
          { status: 400 }
        );
      }
      if (parsedDate.getTime() > Date.now()) scheduledAt = parsedDate;
    }

    const { campaign, recipients } = await createCampaign(
      tenantId,
      businessId,
      input,
      contacts,
      scheduledAt,
      template.name,
      template.language,
      input.headerMediaUrl,
      template.headerType,
    );

    const contactsById = new Map(contacts.map((c) => [c.id, c]));
    const { published, failed } = await publishCampaign(
      campaign.id,
      businessId,
      template.name,
      template.language,
      input.bodyVarMapping,
      input.headerMediaUrl,
      template.headerType,
      recipients,
      contactsById,
      scheduledAt,
    );

    if (published === 0 && recipients.length > 0) {
      console.error("[CAMPAIGNS] No jobs published — check QSTASH_TOKEN / NEXT_PUBLIC_APP_URL", {
        campaignId: campaign.id,
        recipientCount: recipients.length,
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
        {
          success: false,
          error: "Campaign created but no messages could be queued. Check QStash / app URL config.",
        },
        { status: 502 },
      );
    }

    // The recipients stay PENDING and the cron picks the campaign up when it comes due.
    if (scheduledAt) {
      return NextResponse.json(
        {
          success: true,
          data: {
            campaignId: campaign.id,
            total: contacts.length,
            scheduledAt: scheduledAt.toISOString(),
            queued: published,
            queueFailed: failed,
            sentCount: 0,
            failedCount: 0,
          },
        },
        { status: 201 }
      );
    }

    // The counters are zero because nothing has been sent yet, not because nothing will be. The
    // campaign is RUNNING and the worker moves `sentCount`/`failedCount` as each job lands, then
    // marks it COMPLETED once no recipient is still in flight.
    return NextResponse.json(
      {
        success: true,
        data: {
          campaignId: campaign.id,
          total: contacts.length,
          queued: published,
          queueFailed: failed,
          sentCount: 0,
          failedCount: 0,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    // Meta's client throws with the upstream response body embedded, which can carry account
    // identifiers and token hints — so it is logged in full and never returned to the caller.
    console.error("[CAMPAIGNS]", error);

    return NextResponse.json(
      { success: false, error: "Failed to create campaign" },
      { status: 500 }
    );

  }
}
