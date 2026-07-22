// ============================================================================
// OWNER  : Gauransh
// MODULE : Conversations
// ROUTE  : /api/conversations/[id]
//
// METHODS
// GET    - One conversation, its contact, and a page of its messages
// PATCH  - Reassign a conversation or move it through the status lifecycle
//
// ACCESS
// GET    - Authenticated. Scoped to session.user.tenantId; a conversation owned by
//          another workspace answers 404, exactly as a non-existent one does.
// PATCH  - Authenticated. Same scoping. Only `status` and `assigneeId` are writable;
//          any other field in the body is rejected rather than ignored.
// ============================================================================
//
// The thread view is the read counterpart to the webhook's ingestion path and to POST /api/messages:
// those two produce the rows, this reads them back in the order a human experienced them.

import { NextRequest, NextResponse } from "next/server";
import { ConversationStatus } from "@prisma/client";
import { z } from "zod";
import { getBusinessScope } from "@/lib/business";
import { prisma } from "@/lib/prisma";

/**
 * Messages returned per page of a thread.
 *
 * Fixed rather than caller-supplied: a page size the client controls is a page size an attacker
 * controls, and one request for a million-message thread is all it takes to exhaust the connection.
 */
const MESSAGES_PAGE_SIZE = 50;

/** Pages are 1-indexed for the client; Prisma's `skip` is 0-indexed. The conversion lives here only. */
const FIRST_PAGE = 1;

/**
 * The page of a thread the client asked for.
 *
 * Coerced because a query string carries text, not numbers. A page below the first is clamped by
 * validation rather than silently corrected — a negative `skip` is a Prisma error, and a client
 * asking for page zero has a bug worth telling it about.
 */
const messagesPageSchema = z.object({
  page: z.coerce.number().int().min(FIRST_PAGE).default(FIRST_PAGE),
});

/**
 * The only two fields a conversation exposes for update.
 *
 * `strictObject` is the point of this schema. A permissive object would let `unreadCount`,
 * `tenantId` or `lastMessagePreview` ride along in the body and be quietly dropped — or, worse,
 * quietly applied if the update ever spread the parsed result. Rejecting unknown keys makes the
 * writable surface of this route explicit and enforced, rather than implicit and hoped for.
 *
 * `assigneeId` is nullable because unassigning is a real action: handing a thread back to the
 * unclaimed queue is not the same as leaving it alone, and only `null` can express it. `undefined`
 * — the key omitted entirely — means "do not touch", and Prisma treats it exactly so.
 *
 * The refinement exists because an empty body is a client bug: it would otherwise issue a write that
 * changes nothing except `updatedAt`, silently reordering the sender's inbox for no reason.
 */
const updateConversationSchema = z
  .strictObject({
    status: z.nativeEnum(ConversationStatus).optional(),
    assigneeId: z.string().min(1).nullable().optional(),
  })
  .refine(
    (data) => data.status !== undefined || data.assigneeId !== undefined,
    { message: "Provide at least one of: status, assigneeId" }
  );

type UpdateConversationInput = z.infer<typeof updateConversationSchema>;

/**
 * Resolve a conversation while enforcing tenant isolation.
 *
 * `findFirst`, never `findUnique`. `id` is a cuid and unique on its own, so `findUnique({ id })`
 * would happily return another workspace's conversation — uniqueness identifies a row, it does not
 * authorise access to it. Folding `tenantId` into the predicate means a foreign conversation is
 * indistinguishable from one that does not exist, which is the only answer that leaks nothing: a
 * distinct 403 would confirm the row is real and tell the caller they had found something.
 */
async function resolveConversation(
  tenantId: string,
  businessId: string,
  conversationId: string
) {
  return prisma.conversation.findFirst({
    where: { id: conversationId, tenantId, businessId },
    select: {
      id: true,
      status: true,
      assignedToId: true,
      unreadCount: true,
      lastMessagePreview: true,
      lastMessageAt: true,
      createdAt: true,
      updatedAt: true,
      contact: {
        select: { id: true, name: true, phone: true },
      },
    },
  });
}

/**
 * Load one page of a thread, oldest to newest.
 *
 * Prisma reads *newest first*, because that is the only direction in which "page 1" is stable: a
 * thread grows at its newest end, so paging from the oldest message would shift every page boundary
 * each time the customer sends something. Paging from the newest anchors page 1 to the live end of
 * the conversation, which is where the agent is looking. It is also the direction the schema's
 * `(conversationId, createdAt)` index is walked, so the page is found rather than scanned.
 *
 * The page is then reversed in memory — 50 rows, not the thread — because a human reads a
 * conversation forwards. The database order and the display order are different requirements, and
 * this is the seam between them.
 *
 * The count runs alongside the page rather than after it: they are independent reads, so awaiting
 * them in sequence would pay two round trips for no ordering guarantee. They are deliberately not
 * wrapped in a transaction — a transaction exists to make writes atomic, and using one to bundle two
 * reads buys a snapshot nobody asked for at the cost of a held connection.
 */
async function loadConversationMessages(
  tenantId: string,
  businessId: string,
  conversationId: string,
  page: number
) {
  const [messages, total] = await Promise.all([
    prisma.message.findMany({
      where: { tenantId, businessId, conversationId },
      orderBy: { createdAt: "desc" },
      skip: (page - FIRST_PAGE) * MESSAGES_PAGE_SIZE,
      take: MESSAGES_PAGE_SIZE,
    }),
    prisma.message.count({ where: { tenantId, businessId, conversationId } }),
  ]);

  return {
    messages: messages.reverse(),
    pagination: {
      page,
      pageSize: MESSAGES_PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / MESSAGES_PAGE_SIZE),
    },
  };
}

/**
 * Confirm an assignee is a real, active member of this tenant.
 *
 * `assigneeId` is caller-supplied and lands in a foreign key that the schema constrains only to
 * *some* user — not to a user of *this* workspace. Without this check, an agent could assign their
 * conversation to a user in another tenant, who would then appear as the owner of a thread they
 * cannot see. Cross-tenant references are not caught by the database here, so they must be caught
 * before the write.
 *
 * Inactive users are refused for the same reason a resolved thread reopens: assignment means "this
 * person is expected to answer", and a deactivated account will not.
 */
async function isAssignableUser(
  tenantId: string,
  userId: string
): Promise<boolean> {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId, isActive: true },
    select: { id: true },
  });

  return user !== null;
}

/**
 * Apply the update.
 *
 * A single write to a single row, so no transaction: one statement is already atomic, and wrapping
 * it would pin a connection to express a guarantee the database gives for free.
 *
 * The update is keyed by `id` alone because ownership has already been established by
 * `resolveConversation` — re-deriving it here would issue the same read twice. The two calls are not
 * a check-then-act race in any meaningful sense: a conversation cannot change tenants, so the fact
 * this route proved is not one that can expire between the read and the write.
 *
 * `assigneeId` maps onto the schema's `assignedToId`; the API name and the column name differ, and
 * this is the one place that translation happens.
 */
async function updateConversation(
  conversationId: string,
  input: UpdateConversationInput
) {
  return prisma.conversation.update({
    where: { id: conversationId },
    data: {
      status: input.status,
      assignedToId: input.assigneeId,
    },
    select: {
      id: true,
      status: true,
      assignedToId: true,
      unreadCount: true,
      lastMessagePreview: true,
      lastMessageAt: true,
      createdAt: true,
      updatedAt: true,
      contact: {
        select: { id: true, name: true, phone: true },
      },
    },
  });
}

/**
 * Return a conversation and the requested page of its messages.
 *
 * Ownership is established before any message is read. Paging a thread the caller does not own
 * would leak its size through the pagination total even if the rows themselves were withheld, so
 * the 404 comes first and nothing is read behind it.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await getBusinessScope();
  if (!scope) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { tenantId, businessId } = scope;

  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);

    const parsed = messagesPageSchema.safeParse({
      // Absent means page 1; Zod reads a null as a value, so the omission is normalised first.
      page: searchParams.get("page") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const conversation = await resolveConversation(tenantId, businessId, id);
    if (!conversation) {
      return NextResponse.json(
        { success: false, error: "Conversation not found" },
        { status: 404 }
      );
    }

    const { messages, pagination } = await loadConversationMessages(
      tenantId,
      businessId,
      id,
      parsed.data.page
    );

    return NextResponse.json({
      success: true,
      data: { ...conversation, messages, pagination },
    });
  } catch (error) {
    console.error("[CONVERSATIONS]", error);

    return NextResponse.json(
      { success: false, error: "Failed to load conversation" },
      { status: 500 }
    );
  }
}

/**
 * Reassign a conversation, or move it through the status lifecycle.
 *
 * Both preconditions are proved before anything is written: the conversation belongs to this tenant,
 * and — when one is named — the assignee does too. Neither can be inferred from the request, and a
 * write that assumed either would be a cross-tenant reference the schema will not catch.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await getBusinessScope();
  if (!scope) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { tenantId, businessId } = scope;

  try {
    const { id } = await params;

    const parsed = updateConversationSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const conversation = await resolveConversation(tenantId, businessId, id);
    if (!conversation) {
      return NextResponse.json(
        { success: false, error: "Conversation not found" },
        { status: 404 }
      );
    }

    const { assigneeId } = parsed.data;

    // Null is an unassignment and needs no owner to verify; a named assignee does.
    if (assigneeId && !(await isAssignableUser(tenantId, assigneeId))) {
      return NextResponse.json(
        { success: false, error: "Assignee is not an active member of this workspace" },
        { status: 400 }
      );
    }

    const updated = await updateConversation(id, parsed.data);

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[CONVERSATIONS]", error);

    return NextResponse.json(
      { success: false, error: "Failed to update conversation" },
      { status: 500 }
    );
  }
}
