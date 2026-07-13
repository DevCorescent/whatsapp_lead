// ============================================================================
// OWNER  : Gauransh
// MODULE : Conversations
// ROUTE  : /api/conversations
//
// METHODS
// GET    - List the authenticated tenant's conversations for the inbox
//
// ACCESS
// GET    - Authenticated. Scoped to session.user.tenantId; a conversation belonging
//          to another workspace is never returned, under any filter combination.
// ============================================================================
//
// The inbox list is a read model over rows the WhatsApp webhook writes. It reads the conversation's
// denormalised columns — `unreadCount`, `lastMessagePreview`, `lastMessageAt` — rather than joining
// or aggregating the message table, because those columns exist precisely so that rendering an
// inbox of thousands of threads costs one indexed query instead of one subquery per row.

import { NextRequest, NextResponse } from "next/server";
import { ConversationStatus } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
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
  unreadCount: true,
  lastMessagePreview: true,
  lastMessageAt: true,
  updatedAt: true,
  contact: {
    select: { id: true, name: true, phone: true },
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
  filters: ListConversationsFilters
) {
  return prisma.conversation.findMany({
    where: {
      tenantId,
      status: filters.status,
      assignedToId: filters.assigneeId,
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
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { tenantId } = session.user;

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

    const conversations = await listConversations(tenantId, parsed.data);

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
