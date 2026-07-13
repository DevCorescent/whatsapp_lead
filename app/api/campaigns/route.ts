<<<<<<< HEAD
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CampaignStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  status: z.nativeEnum(CampaignStatus).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

const createCampaignSchema = z.object({
  name: z.string().min(1, "Campaign name is required"),
  templateId: z.string().optional(),
  message: z.string().optional(),
  contactIds: z.array(z.string()).optional(),
  tagIds: z.array(z.string()).optional(),
  all: z.boolean().optional(),
}).refine((d) => d.templateId || d.message, { message: "Either templateId or message is required" });

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  try {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      status: searchParams.get("status") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    const { status, page, limit } = parsed.data;
    const where = {
      tenantId,
      ...(status !== undefined && { status }),
    };

    const [total, campaigns] = await Promise.all([
      prisma.campaign.count({ where }),
      prisma.campaign.findMany({
        where,
        include: {
          template: { select: { id: true, name: true, category: true } },
          _count: { select: { contacts: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: campaigns,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("[CAMPAIGNS GET]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch campaigns" }, { status: 500 });
  }
=======
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
// route proves ownership of every recipient before it dispatches anything, and records the outcome
// of each individual send rather than the outcome of the batch.
//
// The schema does not model everything this flow would like to record. Two adaptations, made rather
// than inventing columns:
//
//   - `Campaign` has no body column (it models `templateId`, not free text), so the broadcast text
//     is stored in the `metadata` Json column the schema provides for exactly this.
//   - `CampaignContact` has no `waMessageId` column, so Meta's message id is not persisted per
//     recipient. The consequence is that the webhook's delivery receipts cannot be correlated back
//     to a campaign row, which is why `deliveredCount` / `readCount` on Campaign stay at zero.

import { NextRequest, NextResponse } from "next/server";
import { CampaignStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendTextMessage } from "@/lib/whatsapp";

/**
 * Per-recipient delivery states.
 *
 * `CampaignContact.status` is a plain String in the schema, not an enum, so the vocabulary lives
 * here as constants rather than as magic strings scattered through the send loop. PENDING is the
 * column's own default and is never written explicitly.
 */
const CampaignContactStatus = {
  SENT: "SENT",
  FAILED: "FAILED",
} as const;

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
  sentCount: true,
  failedCount: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CampaignSelect;

/**
 * The body of a campaign being launched.
 *
 * `strictObject` because the writable surface must be enforced rather than merely documented: a
 * permissive object would let `status`, `sentCount` or `tenantId` ride along in the payload and be
 * quietly dropped today — or quietly applied the first time someone spreads the parsed result into a
 * Prisma `data`.
 *
 * `contactIds` is required non-empty. A campaign with no audience is a client bug, and creating a
 * COMPLETED campaign that sent nothing would be a row that lies about what happened.
 */
const createCampaignSchema = z.strictObject({
  name: z.string().min(1, "Campaign name is required"),
  message: z.string().min(1, "Campaign message is required"),
  contactIds: z
    .array(z.string().min(1))
    .nonempty("At least one contact is required"),
});

type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

/** A recipient row, carrying only what the send loop addresses a message with. */
interface CampaignRecipient {
  id: string;
  phone: string;
>>>>>>> c4202d6 (feat(campaigns): implement campaign management APIs)
}

/** The WhatsApp credentials a tenant sends under. */
interface WhatsAppCredentials {
  phoneNumberId: string;
  apiKey: string;
}

/** The tally a completed campaign reports back. */
interface CampaignOutcome {
  sentCount: number;
  failedCount: number;
}

/**
 * List the tenant's campaigns, newest first.
 *
 * `tenantId` is the predicate that makes this a list rather than a leak — it is taken from the
 * session and never from the request, so there is no input a caller could supply to widen it.
 */
async function listCampaigns(tenantId: string) {
  return prisma.campaign.findMany({
    where: { tenantId },
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
 * Resolve the tenant's WhatsApp credentials, or null when the workspace has not connected a number.
 *
 * Both columns are nullable in the schema — a workspace exists before it is wired to Meta — so an
 * unconfigured tenant is an ordinary state reported as a precondition failure, not an exception.
 *
 * `findUnique` is correct here and is the one place in this module that does not carry `tenantId` as
 * a filter: `TenantSettings.tenantId` is itself the unique key, so the lookup *is* the tenant scope.
 */
async function resolveWhatsAppCredentials(
  tenantId: string
): Promise<WhatsAppCredentials | null> {
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: { waPhoneNumberId: true, waApiKey: true },
  });

  if (!settings?.waPhoneNumberId || !settings.waApiKey) return null;

  return {
    phoneNumberId: settings.waPhoneNumberId,
    apiKey: settings.waApiKey,
  };
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
 * The campaign is created RUNNING rather than DRAFT: by the time this returns, the send loop is about
 * to begin, and a row that claimed DRAFT while messages were leaving would be untrue for the entire
 * duration of the send.
 */
async function createCampaign(
  tenantId: string,
  input: CreateCampaignInput,
  contacts: { id: string; phone: string }[]
) {
  return prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.create({
      data: {
        tenantId,
        name: input.name,
        status: CampaignStatus.RUNNING,
        startedAt: new Date(),
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
 * Record the outcome of a single recipient's send.
 *
 * Written per recipient rather than batched at the end of the loop, because the loop is the part of
 * this route most likely to be cut short — a serverless timeout mid-broadcast leaves the campaign
 * half-sent, and a database that recorded the first half is the only thing that makes the rest
 * recoverable. Buffering the results in memory would lose exactly the information needed to resume.
 *
 * `failedReason` is the schema's column; there is no `errorMessage`. Meta's error text is stored
 * as-is for an operator to read, and is never returned to the caller — it embeds account identifiers
 * and token hints.
 */
async function updateCampaignContact(
  campaignContactId: string,
  outcome: { sent: true } | { sent: false; reason: string }
): Promise<void> {
  await prisma.campaignContact.update({
    where: { id: campaignContactId },
    data: outcome.sent
      ? { status: CampaignContactStatus.SENT, sentAt: new Date() }
      : {
          status: CampaignContactStatus.FAILED,
          failedReason: outcome.reason,
        },
  });
}

/**
 * Work through the audience, one message at a time.
 *
 * Sequential by requirement, not by omission. `Promise.all` over a thousand recipients would open a
 * thousand concurrent connections to Meta and breach the Cloud API's rate limits within a second —
 * the failure mode is not a slow campaign but a throttled, and eventually suspended, business number.
 * The loop is the rate limiter.
 *
 * A failed send is a per-recipient outcome, not a campaign outcome: one wrong number must not stop
 * the other nine hundred and ninety-nine messages. The catch is therefore inside the loop, and the
 * loop always runs to completion.
 *
 * No transaction wraps any of this. Holding one open across a network call to Meta would pin a
 * database connection for the entire broadcast, and a rollback would undo delivery records for
 * messages the customers have already received.
 *
 * Meta's message id is not persisted: `CampaignContact` has no column for it. The id is therefore
 * discarded rather than stored somewhere it does not belong.
 */
async function sendCampaign(
  credentials: WhatsAppCredentials,
  message: string,
  recipients: CampaignRecipient[]
): Promise<CampaignOutcome> {
  let sentCount = 0;
  let failedCount = 0;

  for (const recipient of recipients) {
    try {
      await sendTextMessage(
        credentials.phoneNumberId,
        credentials.apiKey,
        recipient.phone,
        message
      );

      await updateCampaignContact(recipient.id, { sent: true });
      sentCount += 1;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";

      await updateCampaignContact(recipient.id, { sent: false, reason });
      failedCount += 1;
    }
  }

  return { sentCount, failedCount };
}

/**
 * Close the campaign out with what actually happened.
 *
 * The counters are written once, from the loop's own tally, rather than incremented per send: a
 * campaign row updated a thousand times would serialise a thousand writes against one row for
 * numbers nobody reads until the end.
 *
 * COMPLETED means "the loop finished", not "every message succeeded" — a campaign in which every
 * recipient failed is still a campaign that ran, and `failedCount` is where that is said. Conflating
 * the two would leave an operator unable to tell a finished campaign from an interrupted one.
 */
async function completeCampaign(
  campaignId: string,
  outcome: CampaignOutcome
): Promise<void> {
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: CampaignStatus.COMPLETED,
      completedAt: new Date(),
      sentCount: outcome.sentCount,
      failedCount: outcome.failedCount,
    },
  });
}

/**
 * Return the tenant's campaigns.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { tenantId } = session.user;

  try {
    const campaigns = await listCampaigns(tenantId);

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
  const session = await auth();
<<<<<<< HEAD
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  try {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

    const parsed = createCampaignSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    const { name, templateId, contactIds, tagIds, all } = parsed.data;

    // Resolve target contacts
    let contacts: { id: string; phone: string }[] = [];
    if (all) {
      contacts = await prisma.contact.findMany({
        where: { tenantId, isBlocked: false, optedOut: false },
        select: { id: true, phone: true },
      });
    } else if (tagIds && tagIds.length > 0) {
      contacts = await prisma.contact.findMany({
        where: { tenantId, isBlocked: false, optedOut: false, tags: { some: { tagId: { in: tagIds } } } },
        select: { id: true, phone: true },
      });
    } else if (contactIds && contactIds.length > 0) {
      contacts = await prisma.contact.findMany({
        where: { id: { in: contactIds }, tenantId, isBlocked: false, optedOut: false },
        select: { id: true, phone: true },
      });
    }

    // Create campaign as DRAFT with contact rows
    const campaign = await prisma.campaign.create({
      data: {
        tenantId,
        name,
        ...(templateId && { templateId }),
        status: "DRAFT",
        totalCount: contacts.length,
        ...(contacts.length > 0 && {
          contacts: {
            create: contacts.map((c) => ({
              contactId: c.id,
              phone: c.phone,
              status: "PENDING",
            })),
          },
        }),
      },
      include: {
        template: { select: { id: true, name: true } },
        _count: { select: { contacts: true } },
      },
    });

    return NextResponse.json({ success: true, data: campaign }, { status: 201 });
  } catch (error) {
    console.error("[CAMPAIGNS POST]", error);
    return NextResponse.json({ success: false, error: "Failed to create campaign" }, { status: 500 });
=======
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { tenantId } = session.user;

  try {
    const parsed = createCampaignSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const input = parsed.data;

    const contacts = await resolveContacts(tenantId, input.contactIds);
    if (!contacts) {
      return NextResponse.json(
        { success: false, error: "One or more contacts could not be found" },
        { status: 400 }
      );
    }

    const credentials = await resolveWhatsAppCredentials(tenantId);
    if (!credentials) {
      return NextResponse.json(
        {
          success: false,
          error: "WhatsApp is not connected for this workspace",
        },
        { status: 409 }
      );
    }

    const campaign = await createCampaign(tenantId, input, contacts);

    const recipients = await loadCampaignRecipients(tenantId, campaign.id);
    const outcome = await sendCampaign(credentials, input.message, recipients);

    await completeCampaign(campaign.id, outcome);

    return NextResponse.json(
      {
        success: true,
        data: {
          campaignId: campaign.id,
          total: recipients.length,
          sentCount: outcome.sentCount,
          failedCount: outcome.failedCount,
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
>>>>>>> c4202d6 (feat(campaigns): implement campaign management APIs)
  }
}
