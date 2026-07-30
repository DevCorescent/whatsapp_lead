// ============================================================================
// OWNER  : Gauransh
// MODULE : Conversations
// ROUTE  : /api/conversations
//
// METHODS
// GET    - List the authenticated tenant's conversations for the inbox
// POST   - Open the conversation with a saved contact, creating it on first use
//
// ACCESS
// GET    - Authenticated. Scoped to session.user.tenantId; a conversation belonging
//          to another workspace is never returned, under any filter combination.
// POST   - Authenticated. The contact must belong to the caller's tenant *and* active
//          business; one belonging to another workspace answers 404, exactly as a
//          non-existent one does.
// ============================================================================
//
// The inbox list is a read model over rows the WhatsApp webhook writes. It reads the conversation's
// denormalised columns — `unreadCount`, `lastMessagePreview`, `lastMessageAt` — rather than joining
// or aggregating the message table, because those columns exist precisely so that rendering an
// inbox of thousands of threads costs one indexed query instead of one subquery per row.

import { NextRequest, NextResponse } from "next/server";
import { ConversationStatus } from "@prisma/client";
import { z } from "zod";
import { getBusinessScope } from "@/lib/business";
import { findOrCreateConversation } from "@/lib/conversations";
import { prisma } from "@/lib/prisma";

/**
 * Filters the inbox may narrow by.
 *
 * `status` is validated against the schema's own enum rather than a hand-written list of strings.
 * A filter value that is not a real `ConversationStatus` is a client bug, and surfacing it as a 400
 * is more useful than silently returning an empty list that reads as "no conversations".
 *
 * Both filters are optional: their absence means "do not narrow", which is the inbox's default view.
 */
const listConversationsSchema = z.object({
  status: z.nativeEnum(ConversationStatus).optional(),
  assigneeId: z.string().min(1).optional(),
});

type ListConversationsFilters = z.infer<typeof listConversationsSchema>;

/**
 * The body of "start a conversation with this contact".
 *
 * `strictObject` because the writable surface is exactly one field. A conversation is not a thing
 * a client gets to describe — its status, channel, counters and preview are all owned by the
 * schema and by the two writers that move them — so anything else in the body is a client bug
 * worth reporting rather than a value to quietly drop.
 *
 * The contact is named by id rather than by phone number: the contact must already exist for its
 * conversation to be opened, and resolving a number here would let this route create contacts as a
 * side effect of opening a thread. Creating contacts is POST /api/contacts' job.
 */
const createConversationSchema = z.strictObject({
  contactId: z.string().min(1, "A contact is required"),
});

/**
 * The columns the inbox list actually renders.
 *
 * Declared as a `select` rather than an `include` because the inbox is the highest-traffic read in
 * the product, and every column it does not draw is bytes moved for nothing. The contact is joined
 * here rather than fetched per conversation — resolving it row by row is the canonical N+1.
 */
const CONVERSATION_LIST_SELECT = {
  id: true,
  status: true,
  assignedToId: true,
  // Carried so the inbox header's AI auto-reply switch renders correctly from the list row
  // alone, before the detail query for that thread has resolved.
  isAiActive: true,
  unreadCount: true,
  lastMessagePreview: true,
  lastMessageAt: true,
  createdAt: true,
  updatedAt: true,
  contact: {
    // `avatarUrl` and `company` are drawn by the row's avatar and matched by the list's search
    // box; without them the avatar always falls back to initials and searching by company finds
    // nothing. `createdAt` above is what keeps a brand-new thread — one with no message yet, and
    // therefore no `lastMessageAt` — sortable at the top of the list instead of at the bottom.
    select: { id: true, name: true, phone: true, avatarUrl: true, company: true },
  },
} as const;

/**
 * List the tenant's conversations, most recently changed first.
 *
 * `tenantId` is not one predicate among several — it is the predicate that makes every other one
 * safe. `status` and `assigneeId` arrive from the caller and narrow *within* the tenant; without the
 * tenant clause, a crafted `assigneeId` would happily match another workspace's threads.
 *
 * Ordering is by `updatedAt`, not `lastMessageAt`: a thread that was reassigned or resolved has
 * changed for the agent even though nobody spoke, and an inbox that hid that would hide work. The
 * schema's descending index is on `lastMessageAt`, so this ordering sorts rather than walks an
 * index — the correct trade at inbox scale, and the reason the column choice is spelled out here
 * rather than left to look like an oversight.
 */
async function listConversations(
  tenantId: string,
  businessId: string,
  filters: ListConversationsFilters
) {
  return prisma.conversation.findMany({
    where: {
      tenantId,
      // The inbox belongs to one business, not to the whole workspace. Every Conversation
      // carries the businessId it was created under (see lib/inbound.ts), so omitting this
      // showed every business in the tenant the union of all their inboxes — which is what
      // made switching accounts appear to do nothing.
      businessId,
      ...(filters.status !== undefined && { status: filters.status }),
      ...(filters.assigneeId !== undefined && { assignedToId: filters.assigneeId }),
    },
    select: CONVERSATION_LIST_SELECT,
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * Return the inbox for the authenticated tenant.
 *
 * The handler orchestrates: authenticate, validate, delegate, respond. The tenant is taken from the
 * session and never from the request — a caller-supplied `tenantId` would turn every filter below
 * into an invitation to read another workspace.
 */
export async function GET(req: NextRequest) {
  // getBusinessScope rather than auth(): the inbox is scoped to the *active business*, which
  // lives in the current_business cookie and is re-validated against the tenant on every call.
  const scope = await getBusinessScope();
  if (!scope) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { tenantId, businessId } = scope;

  try {
    const { searchParams } = new URL(req.url);

    // `searchParams.get` yields null for an absent key, and Zod reads null as a value rather than an
    // omission — so absent filters are normalised to undefined before parsing.
    const parsed = listConversationsSchema.safeParse({
      status: searchParams.get("status") ?? undefined,
      assigneeId: searchParams.get("assigneeId") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const conversations = await listConversations(tenantId, businessId, parsed.data);

    return NextResponse.json({ success: true, data: conversations });
  } catch (error) {
    // The caller learns only that the read failed. Prisma's errors carry query shapes and column
    // names, which describe our schema to anyone able to provoke one.
    console.error("[CONVERSATIONS]", error);

    return NextResponse.json(
      { success: false, error: "Failed to load conversations" },
      { status: 500 }
    );
  }
}

/**
 * Open the conversation with a saved contact, creating it only if there isn't one.
 *
 * This is what "message this contact" resolves to. It is deliberately idempotent: the caller asks
 * for *the* thread with a contact, not for a new one, so pressing the button twice — or two agents
 * pressing it at once — lands both of them in the same thread rather than splitting the contact's
 * history in half. The find-or-create rule itself is `findOrCreateConversation`, the same helper
 * the inbound pipeline uses, so a thread opened from the CRM and a thread opened by the customer's
 * first message are the same row.
 *
 * The contact is re-read under the active business before anything is written. `contactId` arrives
 * from the client, and `Conversation.contactId` is a foreign key the database constrains only to
 * *some* contact — so without this check an id copied from another workspace would open a thread
 * that this business's inbox then lists as its own.
 *
 * Answers 201 when a thread was created and 200 when an existing one was returned, so the client
 * can tell "started a conversation" from "opened one" without a second request.
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
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = createConversationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const contact = await prisma.contact.findFirst({
      where: { id: parsed.data.contactId, tenantId, businessId },
      select: { id: true, isBlocked: true },
    });

    if (!contact) {
      return NextResponse.json(
        { success: false, error: "Contact not found" },
        { status: 404 }
      );
    }

    // A blocked contact is one the workspace has chosen to stop talking to. Opening a thread for
    // them would put the conversation back in the inbox and invite an agent to reply, which is the
    // opposite of what blocking means.
    if (contact.isBlocked) {
      return NextResponse.json(
        { success: false, error: "This contact is blocked. Unblock them to start a conversation." },
        { status: 409 }
      );
    }

    const { conversation, created } = await findOrCreateConversation(
      tenantId,
      businessId,
      contact.id
    );

    // Re-read through the list projection so the response is shaped exactly like a row of
    // GET /api/conversations — the client can select it, or drop it into the cached list, with no
    // reshaping and no second fetch for the contact.
    const row = await prisma.conversation.findUnique({
      where: { id: conversation.id },
      select: CONVERSATION_LIST_SELECT,
    });

    return NextResponse.json(
      { success: true, data: row, created },
      { status: created ? 201 : 200 }
    );
  } catch (error) {
    console.error("[CONVERSATIONS]", error);

    return NextResponse.json(
      { success: false, error: "Failed to start conversation" },
      { status: 500 }
    );
  }
}
