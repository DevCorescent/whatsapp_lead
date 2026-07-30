
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
import { getBusinessScope, resolveWhatsAppCreds } from "@/lib/business";
import { publishCampaignSend } from "@/lib/queue";

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
  // The list draws a delivery funnel — recipients, sent, delivered, read, replied, failed — and
  // every counter it renders has to be selected or the column shows a blank where a number
  // belongs. `scheduledAt` is what puts the send time under a SCHEDULED campaign's name.
  totalCount: true,
  sentCount: true,
  deliveredCount: true,
  readCount: true,
  repliedCount: true,
  failedCount: true,
  scheduledAt: true,
  templateId: true,
  template: { select: { id: true, name: true } },
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
  message: z.string().min(1, "Campaign message is required"),
  contactIds: z.array(z.string().min(1)).optional(),
  all: z.boolean().optional(),
  scheduledAt: z.string().optional(),
  /**
   * The approved WhatsApp template this broadcast was composed from, when one was chosen.
   *
   * Optional because the send itself is a plain text message — `Campaign.templateId` records
   * *which* approved template the copy came from, which is what makes a campaign auditable against
   * Meta's approval. It is verified below rather than trusted: an id naming another workspace's
   * template, or one Meta has not approved, is rejected.
   */
  templateId: z.string().min(1).optional(),
});

type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

/** A recipient row, carrying only what the send loop addresses a message with. */
interface CampaignRecipient {
  id: string;
  phone: string;
}

/**
 * List the tenant's campaigns, newest first.
 *
 * `tenantId` is the predicate that makes this a list rather than a leak — it is taken from the
 * session and never from the request, so there is no input a caller could supply to widen it.
 */
async function listCampaigns(
  tenantId: string,
  businessId: string,
  status?: CampaignStatus
) {
  return prisma.campaign.findMany({
    // Campaigns are created with the active businessId and send on that business's WhatsApp
    // number, so the list belongs to that business alone.
    where: { tenantId, businessId, ...(status && { status }) },
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
): Promise<{ id: string; phone: string }[] | null> {
  const contacts = await prisma.contact.findMany({
    where: { tenantId, id: { in: contactIds } },
    select: { id: true, phone: true },
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
  contacts: { id: string; phone: string }[],
  scheduledAt: Date | null
) {
  return prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.create({
      data: {
        tenantId,
        businessId,
        name: input.name,
        status: scheduledAt ? CampaignStatus.SCHEDULED : CampaignStatus.RUNNING,
        ...(scheduledAt ? { scheduledAt } : { startedAt: new Date() }),
        ...(input.templateId && { templateId: input.templateId }),
        totalCount: contacts.length,
        metadata: { message: input.message },
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

    return campaign;
  });
}

/**
 * Load the recipient rows a campaign must work through.
 *
 * `createMany` does not return the rows it inserted, so the send loop cannot address them by primary
 * key without reading them back. This is that read — one query, selecting only the id the update will
 * key on and the phone the message will go to.
 *
 * Scoped through `campaign.tenantId` rather than by campaign id alone: `CampaignContact` carries no
 * `tenantId` of its own, so the tenant boundary here runs through its parent, and following the
 * relation is what keeps a caller-supplied campaign id from reaching another workspace's recipients.
 */
async function loadCampaignRecipients(
  tenantId: string,
  campaignId: string
): Promise<CampaignRecipient[]> {
  return prisma.campaignContact.findMany({
    where: { campaignId, campaign: { tenantId } },
    select: { id: true, phone: true },
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
async function publishCampaign(
  campaignId: string,
  businessId: string,
  message: string,
  recipients: CampaignRecipient[]
): Promise<void> {
  for (const recipient of recipients) {
    await publishCampaignSend({
      campaignId,
      recipientId: recipient.id,
      phone: recipient.phone,
      message,
      businessId,
    });
  }
}

/**
 * Return the workspace's campaigns, optionally narrowed to one status.
 *
 * The status tabs on the campaigns page have always sent `?status=`; nothing read it, so every tab
 * showed every campaign. It is validated against the schema's own enum rather than interpolated: an
 * unrecognised value is a client bug, and answering 400 is more useful than a list that silently
 * ignored the filter.
 */
export async function GET(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { tenantId, businessId } = scope;

  try {
    const requested = new URL(req.url).searchParams.get("status");
    const parsedStatus = z.nativeEnum(CampaignStatus).optional().safeParse(requested ?? undefined);

    if (!parsedStatus.success) {
      return NextResponse.json(
        { success: false, error: "Unknown campaign status filter" },
        { status: 400 }
      );
    }

    const campaigns = await listCampaigns(tenantId, businessId, parsedStatus.data);

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

    // A template is proved to be this workspace's, and approved, before the campaign row exists.
    // Meta rejects a broadcast composed from anything else, and a campaign that referenced another
    // business's template would attribute the send to an approval it never had.
    if (input.templateId) {
      const template = await prisma.messageTemplate.findFirst({
        where: { id: input.templateId, tenantId, businessId },
        select: { status: true },
      });

      if (!template) {
        return NextResponse.json(
          { success: false, error: "Template not found in this workspace" },
          { status: 400 }
        );
      }

      if (template.status.toUpperCase() !== "APPROVED") {
        return NextResponse.json(
          { success: false, error: "Only approved templates can be used for a campaign" },
          { status: 400 }
        );
      }
    }

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

    const creds = await resolveWhatsAppCreds(businessId);
    if (!creds.phoneNumberId || !creds.apiKey) {
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

    const campaign = await createCampaign(tenantId, businessId, input, contacts, scheduledAt);

    // The recipients stay PENDING and the cron picks the campaign up when it comes due.
    if (scheduledAt) {
      return NextResponse.json(
        {
          success: true,
          data: {
            campaignId: campaign.id,
            total: contacts.length,
            scheduledAt: scheduledAt.toISOString(),
            sentCount: 0,
            failedCount: 0,
          },
        },
        { status: 201 }
      );
    }

    const recipients = await loadCampaignRecipients(tenantId, campaign.id);

    await publishCampaign(campaign.id, businessId, input.message, recipients);

    // The counters are zero because nothing has been sent yet, not because nothing will be. The
    // campaign is RUNNING and the worker moves `sentCount`/`failedCount` as each job lands, then
    // marks it COMPLETED once no recipient is still in flight. This matches the shape the scheduled
    // branch above has always returned.
    return NextResponse.json(
      {
        success: true,
        data: {
          campaignId: campaign.id,
          total: recipients.length,
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
