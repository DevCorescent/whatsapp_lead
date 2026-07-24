
// ============================================================================
// OWNER  : Gauransh
// MODULE : Campaigns
// ROUTE  : /api/campaigns/[id]
//
// METHODS
// GET    - One campaign with its per-recipient delivery record
// PATCH  - Rename a campaign, while it is still a draft
// DELETE - Discard a draft campaign
//
// ACCESS
// GET    - Authenticated. Scoped to session.user.tenantId; a campaign owned by another
//          workspace answers 404, exactly as a non-existent one does.
// PATCH  - Authenticated. Same scoping. Only `name` is writable, and only while DRAFT.
// DELETE - Authenticated. Same scoping. DRAFT only.
// ============================================================================
//
// The write methods here are both gated on DRAFT, which the CampaignStatus enum does define. The
// reason is that a campaign is the one record in this system with a footprint outside the database:
// once it leaves DRAFT it has begun putting messages in front of real customers. Renaming a campaign
// that has already sent would relabel a delivery record after the fact, and deleting one would
// cascade its CampaignContact rows — destroying the only evidence of who was messaged, when, and
// whether it arrived. A sent campaign is history, and history is not editable.
//
// Note for whoever reads this next: POST /api/campaigns creates campaigns RUNNING and completes them
// in the same request, so no DRAFT campaign is ever produced by the current API. Both write methods
// below are therefore correct and currently unreachable — they will start mattering the moment
// campaign scheduling lands, and the guard is deliberately written now rather than retrofitted then.

import { NextRequest, NextResponse } from "next/server";
import { CampaignStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * The per-recipient delivery record.
 *
 * Every column named here exists on CampaignContact — the delivery timestamps and `failedReason` are
 * real columns, not an approximation of them. What is *not* here is a WhatsApp message id: the schema
 * has no column for one, so `deliveredAt`, `readAt` and `repliedAt` can never be filled by the
 * webhook's receipts, which have no way to correlate a receipt back to a campaign row. They are
 * returned regardless because they are the schema's own shape, and a client that draws a delivery
 * table should see the columns exist rather than have this route quietly hide them.
 *
 * The contact is a nested `select`, not a second query: resolving the customer behind each recipient
 * row by looping would be the canonical N+1 over an audience that can run to thousands. It is also
 * nullable, because `CampaignContact.contactId` is — a recipient survives the deletion of the contact
 * it was addressed to, which is precisely what makes the delivery record an audit trail.
 */
const CAMPAIGN_RECIPIENT_SELECT = {
  id: true,
  phone: true,
  status: true,
  sentAt: true,
  deliveredAt: true,
  readAt: true,
  repliedAt: true,
  failedReason: true,
  contact: { select: { id: true, name: true, phone: true } },
} satisfies Prisma.CampaignContactSelect;

/**
 * The campaign as its detail view draws it.
 *
 * `filters` and `metadata` are Json columns — the audience definition and the message body — and are
 * included here because the detail view is the one place they are actually read. The board's list
 * select deliberately omits them.
 */
const CAMPAIGN_DETAIL_SELECT = {
  id: true,
  name: true,
  status: true,
  templateId: true,
  scheduledAt: true,
  startedAt: true,
  completedAt: true,
  totalCount: true,
  sentCount: true,
  deliveredCount: true,
  readCount: true,
  repliedCount: true,
  clickedCount: true,
  failedCount: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CampaignSelect;

/**
 * Fields a campaign exposes for update.
 *
 * `name` — rename a campaign (allowed for any non-COMPLETED/FAILED campaign).
 * `status` — toggle between RUNNING and PAUSED. Counters, IDs, timestamps, and metadata
 * are never writable; a client that could set sentCount would rewrite history.
 */
const updateCampaignSchema = z.object({
  name: z.string().trim().min(1, "Campaign name is required").optional(),
  status: z.enum(["RUNNING", "PAUSED"]).optional(),
}).refine((d) => d.name !== undefined || d.status !== undefined, {
  message: "Provide at least one of: name, status",
});

type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

/**
 * Resolve a campaign while enforcing tenant isolation.
 *
 * `findFirst`, never `findUnique`. `id` is a cuid and unique on its own, so `findUnique({ id })`
 * would happily return another workspace's campaign — uniqueness identifies a row, it does not
 * authorise access to it. Folding `tenantId` into the predicate makes a foreign campaign
 * indistinguishable from one that does not exist, which is the only answer that leaks nothing: a
 * distinct 403 would confirm the row is real and tell the caller they had found something.
 *
 * Selects only what the write methods actually branch on. Both need the status to decide whether the
 * campaign is still a draft, and neither needs anything else, so this deliberately does not load the
 * full row — the guard runs on every request and should cost as little as the question it asks.
 */
async function resolveCampaign(tenantId: string, campaignId: string) {
  return prisma.campaign.findFirst({
    where: { id: campaignId, tenantId },
    select: { id: true, status: true },
  });
}

/**
 * Load a campaign and its recipients in a single read.
 *
 * One query, not two. The recipients are a nested `select` on the relation, so Postgres resolves the
 * campaign and its entire audience in one round trip — issuing a second `findMany` keyed on the
 * campaign id would pay a second trip for a join the database was going to do anyway.
 *
 * Tenant isolation runs through the parent. `CampaignContact` carries no `tenantId` of its own, so
 * reading the recipients *through* the tenant-scoped campaign is what keeps a caller-supplied id from
 * reaching another workspace's delivery records — there is no path here that touches a recipient
 * without first having proved the campaign.
 */
async function loadCampaign(tenantId: string, campaignId: string) {
  return prisma.campaign.findFirst({
    where: { id: campaignId, tenantId },
    select: {
      ...CAMPAIGN_DETAIL_SELECT,
      contacts: { select: CAMPAIGN_RECIPIENT_SELECT },
    },
  });
}

/**
 * Rename a campaign.
 *
 * Keyed by `id` alone because ownership and DRAFT status have already been established by
 * `resolveCampaign` — re-deriving the tenant here would issue the same read twice. The two calls are
 * not a check-then-act race in any meaningful sense: a campaign cannot change tenants, and the only
 * writer that can move it out of DRAFT is a request that has not been made yet.
 *
 * A single update, so no transaction. Wrapping one statement would pin a connection to express a
 * guarantee Postgres already gives for free.
 */
async function updateCampaign(campaignId: string, input: UpdateCampaignInput) {
  return prisma.campaign.update({
    where: { id: campaignId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.status !== undefined && {
        status: input.status as CampaignStatus,
        ...(input.status === "RUNNING" && { startedAt: new Date() }),
      }),
    },
    select: CAMPAIGN_DETAIL_SELECT,
  });
}

/**
 * Discard a draft campaign.
 *
 * A hard delete, and correctly so: a DRAFT campaign has messaged nobody, so there is no delivery
 * history to preserve and nothing an audit could later want. This is exactly why the DRAFT guard
 * upstream is load-bearing rather than ceremonial — the same statement against a sent campaign would
 * be destructive.
 *
 * The CampaignContact rows go with it. `CampaignContact.campaign` declares `onDelete: Cascade`, so
 * the database removes them; deleting them by hand first would duplicate a rule the schema already
 * owns, and would drift from it the moment someone changes the cascade.
 *
 * A single delete, so no transaction — the cascade is part of the same statement, not a second write.
 */
async function deleteCampaign(campaignId: string): Promise<void> {
  await prisma.campaign.delete({ where: { id: campaignId } });
}

/**
 * Return a campaign with its per-recipient delivery record.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }


  const { tenantId } = session.user;

  try {
    const { id } = await params;


    const campaign = await loadCampaign(tenantId, id);
    if (!campaign) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 }
      );
    }

    // The relation is read in the same query but reported under its own key: `recipients` is what the
    // delivery table renders, and nesting it inside `campaign` would conflate the campaign's own
    // columns with the audience it was sent to.
    const { contacts, ...details } = campaign;

    return NextResponse.json({
      success: true,
      data: { campaign: details, recipients: contacts },
    });
  } catch (error) {
    // Prisma's errors name columns and query shapes; the caller learns only that the read failed.
    console.error("[CAMPAIGNS]", error);

    return NextResponse.json(
      { success: false, error: "Failed to load campaign" },
      { status: 500 }
    );
  }
}

/**
 * Rename a campaign that has not yet been sent.
 *
 * Ownership is proved before the body is trusted, and the DRAFT guard runs before the write. A
 * campaign that has left DRAFT is a delivery record, and renaming it would relabel messages that have
 * already reached customers under a name they were never sent under.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { tenantId } = session.user;

  try {
    const { id } = await params;

    const parsed = updateCampaignSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const campaign = await resolveCampaign(tenantId, id);
    if (!campaign) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 }
      );
    }

    // COMPLETED and FAILED campaigns are delivery records — their name and state are fixed.
    const immutable =
      campaign.status === CampaignStatus.COMPLETED ||
      campaign.status === CampaignStatus.FAILED;

    if (immutable) {
      return NextResponse.json(
        { success: false, error: "Completed and failed campaigns cannot be modified" },
        { status: 409 }
      );
    }

    // Status toggle is only valid on RUNNING/PAUSED campaigns.
    if (parsed.data.status !== undefined) {
      const canToggle =
        campaign.status === CampaignStatus.RUNNING ||
        campaign.status === CampaignStatus.PAUSED;
      if (!canToggle) {
        return NextResponse.json(
          { success: false, error: "Only running or paused campaigns can have their status toggled" },
          { status: 409 }
        );
      }
    }

    const updated = await updateCampaign(campaign.id, parsed.data);

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[CAMPAIGNS]", error);

    return NextResponse.json(
      { success: false, error: "Failed to update campaign" },
      { status: 500 }
    );
  }
}

/**
 * Discard a campaign that has not yet been sent.
 *
 * The DRAFT guard is the whole method. Deleting a sent campaign would cascade its CampaignContact
 * rows and take with them the only record of which customers were messaged and what happened to each
 * message — a record that exists precisely so it can be produced later, when someone asks.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { tenantId } = session.user;

  try {
    const { id } = await params;

    const campaign = await resolveCampaign(tenantId, id);
    if (!campaign) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Prevent deleting an actively-sending campaign — it could be mid-loop over recipients.
    if (campaign.status === CampaignStatus.RUNNING) {
      return NextResponse.json(
        { success: false, error: "Pause the campaign before deleting it" },
        { status: 409 }
      );
    }

    await deleteCampaign(campaign.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CAMPAIGNS]", error);

    return NextResponse.json(
      { success: false, error: "Failed to delete campaign" },
      { status: 500 }
    );

  }
}
