// ============================================================================
// OWNER  : Gauransh
// MODULE : Support
// ROUTE  : /api/tickets
//
// METHODS
// GET    - List the authenticated tenant's tickets, newest first (paginated)
// POST   - Open a ticket, optionally against an existing conversation
//
// ACCESS
// GET    - Authenticated. Scoped to session.user.tenantId; no filter combination
//          can widen the read beyond the caller's own workspace.
// POST   - Authenticated. Same scoping; the conversation and the assignee are both
//          re-verified against the tenant before the write.
// ============================================================================
//
// A ticket is the unit of support work. It may hang off a conversation the webhook created, or stand
// alone — `Ticket.conversationId` is nullable — but where it does reference one, that reference is a
// foreign key the database constrains only to *some* conversation, not to one of *this* tenant. Every
// write here therefore begins by proving the rows it is about to point at are ours.
//
// A ticket that names no assignee is not left unclaimed: the create form supplies neither an assignee
// nor an SLA, so the server auto-assigns to the least-loaded agent and derives the deadline from the
// priority. Both are done here rather than on the client because both are decisions the workspace
// makes, not the caller.

import { NextRequest, NextResponse } from "next/server";
import { Prisma, TicketPriority, TicketStatus } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Columns the ticket list actually renders.
 *
 * A `select`, not an `include`: the list draws a row, not a record. The assignee and the
 * conversation's contact are nested selects rather than per-ticket lookups — resolving them in a loop
 * is the canonical N+1 — and both are nullable, because an unassigned, standalone ticket is a normal
 * state.
 */
const TICKET_SELECT = {
  id: true,
  subject: true,
  status: true,
  priority: true,
  department: true,
  slaDeadline: true,
  conversationId: true,
  resolvedAt: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
  assignedTo: { select: { id: true, name: true, avatar: true } },
  conversation: {
    select: {
      id: true,
      contact: { select: { id: true, name: true, phone: true } },
    },
  },
} satisfies Prisma.TicketSelect;

/**
 * SLA windows by priority, in hours.
 *
 * A newly opened ticket's `slaDeadline` is derived from its priority rather than accepted from the
 * client: the create form offers no field for it, and a deadline a caller controls is one they can
 * set to never expire. The webhook and the list both read this column, so it must be filled at open.
 */
const SLA_HOURS: Record<TicketPriority, number> = {
  URGENT: 4,
  HIGH: 24,
  MEDIUM: 48,
  LOW: 72,
};

function slaDeadline(priority: TicketPriority): Date {
  const deadline = new Date();
  deadline.setHours(deadline.getHours() + SLA_HOURS[priority]);
  return deadline;
}

/**
 * Filters the list may narrow by, plus pagination.
 *
 * The enums are validated against the schema's own `TicketStatus`/`TicketPriority` rather than a
 * hand-written list of strings — a value that is not a real status is a client bug, and a 400 is more
 * useful than an empty list that reads as "no tickets". `page` and `limit` are coerced because a query
 * string carries text, and `limit` is capped so one request cannot ask for an unbounded scan.
 *
 * There is no `tenantId` parameter and there never will be: the tenant comes from the session, so no
 * input a caller sends can widen the read.
 */
const listTicketsSchema = z.object({
  status: z.nativeEnum(TicketStatus).optional(),
  priority: z.nativeEnum(TicketPriority).optional(),
  assigneeId: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

type ListTicketsFilters = z.infer<typeof listTicketsSchema>;

/**
 * The body of a ticket being opened.
 *
 * `strictObject` because the writable surface must be enforced rather than documented: a permissive
 * object would let `status`, `resolvedAt`, `closedAt` or `tenantId` ride along in the payload —
 * quietly dropped today, quietly applied the first time someone spreads the parsed result into a
 * Prisma `data`. `status` is absent by design: a ticket is opened OPEN (or ASSIGNED once an agent is
 * attached), and a client able to create one already RESOLVED could close support requests that were
 * never worked. `slaDeadline` is likewise absent — it is derived, not supplied.
 */
const createTicketSchema = z.strictObject({
  conversationId: z.string().min(1).optional(),
  subject: z.string().trim().min(1, "Subject is required"),
  priority: z.nativeEnum(TicketPriority).optional(),
  assignedToId: z.string().min(1).optional(),
  department: z.string().trim().min(1).optional(),
});

type CreateTicketInput = z.infer<typeof createTicketSchema>;

/**
 * List the tenant's tickets, newest first, one page at a time.
 *
 * `tenantId` is not one predicate among several — it is the predicate that makes the others safe.
 * `status`, `priority` and `assigneeId` arrive from the caller and narrow *within* the tenant; without
 * the tenant clause they would narrow across all of them. The `(tenantId, status)` index serves the
 * status filter directly.
 */
async function listTickets(tenantId: string, filters: ListTicketsFilters) {
  const where = {
    tenantId,
    status: filters.status,
    priority: filters.priority,
    ...(filters.assigneeId !== undefined && { assignedToId: filters.assigneeId }),
  };

  const [total, tickets] = await Promise.all([
    prisma.ticket.count({ where }),
    prisma.ticket.findMany({
      where,
      select: TICKET_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);

  return {
    tickets,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.ceil(total / filters.limit),
    },
  };
}

/**
 * Confirm a conversation is one of ours before a ticket is hung off it.
 *
 * `conversationId` is caller-supplied and lands in a foreign key the database constrains only to
 * *some* Conversation — not to a conversation of *this* tenant. Without this check an agent could
 * open a ticket against another workspace's thread, and every later read of that ticket would join
 * across the tenant boundary. Postgres will not catch this; it has to be caught here.
 */
async function isTenantConversation(
  tenantId: string,
  conversationId: string
): Promise<boolean> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
    select: { id: true },
  });

  return conversation !== null;
}

/**
 * Confirm an assignee is an active member of this tenant.
 *
 * The same cross-tenant foreign key hazard as the conversation above. Inactive users are refused
 * because assignment means "this person is expected to work the ticket", and a deactivated account
 * will not.
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
 * Pick the active agent carrying the fewest open tickets, or null when the tenant has none.
 *
 * The create form supplies no assignee, so a ticket that named none would otherwise open unclaimed.
 * Balancing by open-ticket count (anything not RESOLVED or CLOSED) spreads support load rather than
 * always landing on the same agent. SUPER_ADMIN is excluded implicitly — it is not a support role.
 */
async function autoAssignAgent(tenantId: string): Promise<string | null> {
  const agents = await prisma.user.findMany({
    where: {
      tenantId,
      isActive: true,
      role: { in: ["AGENT", "MANAGER", "ADMIN"] },
    },
    select: {
      id: true,
      _count: {
        select: {
          assignedTickets: { where: { status: { notIn: ["RESOLVED", "CLOSED"] } } },
        },
      },
    },
  });

  if (agents.length === 0) return null;

  return agents.sort(
    (a, b) => a._count.assignedTickets - b._count.assignedTickets
  )[0].id;
}

/**
 * Open a ticket.
 *
 * A single create, so no transaction: one statement is already atomic, and wrapping it would pin a
 * connection to express a guarantee Postgres gives for free.
 *
 * When an assignee is resolved the ticket opens ASSIGNED rather than OPEN, so the inbox reflects that
 * someone owns it. `slaDeadline` is always stamped from the priority. Every other column is left to
 * the schema's defaults.
 */
async function createTicket(
  tenantId: string,
  input: CreateTicketInput,
  assignedToId: string | null,
  priority: TicketPriority
) {
  return prisma.ticket.create({
    data: {
      tenantId,
      conversationId: input.conversationId,
      subject: input.subject,
      priority,
      department: input.department,
      slaDeadline: slaDeadline(priority),
      ...(assignedToId && {
        assignedToId,
        status: TicketStatus.ASSIGNED,
      }),
    },
    select: TICKET_SELECT,
  });
}

/**
 * Return the tenant's tickets.
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
    const parsed = listTicketsSchema.safeParse({
      status: searchParams.get("status") ?? undefined,
      priority: searchParams.get("priority") ?? undefined,
      assigneeId: searchParams.get("assigneeId") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { tickets, pagination } = await listTickets(tenantId, parsed.data);

    return NextResponse.json({ success: true, data: tickets, pagination });
  } catch (error) {
    // Prisma's errors name columns and query shapes; the caller learns only that the read failed.
    console.error("[TICKETS]", error);

    return NextResponse.json(
      { success: false, error: "Failed to load tickets" },
      { status: 500 }
    );
  }
}

/**
 * Open a ticket.
 *
 * Both cross-tenant foreign keys are proved before the write. Neither can be inferred from the
 * request, and a create that assumed either would plant a reference the database is happy to accept
 * and no later query can safely follow. An explicit assignee wins; otherwise the ticket is
 * auto-assigned so it does not open unclaimed.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { tenantId } = session.user;

  try {
    const parsed = createTicketSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const input = parsed.data;

    if (
      input.conversationId &&
      !(await isTenantConversation(tenantId, input.conversationId))
    ) {
      return NextResponse.json(
        { success: false, error: "Conversation not found" },
        { status: 404 }
      );
    }

    if (
      input.assignedToId &&
      !(await isAssignableUser(tenantId, input.assignedToId))
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Assignee is not an active member of this workspace",
        },
        { status: 400 }
      );
    }

    const priority = input.priority ?? TicketPriority.MEDIUM;
    // A caller-named assignee (already verified) wins; otherwise balance the load across the team.
    const assignedToId = input.assignedToId ?? (await autoAssignAgent(tenantId));

    const ticket = await createTicket(tenantId, input, assignedToId, priority);

    return NextResponse.json({ success: true, data: ticket }, { status: 201 });
  } catch (error) {
    // `Ticket.conversationId` is @unique, so a conversation carries at most one ticket. A second
    // attempt is not a server fault but a conflict the caller can act on — and the unique index is
    // what makes the check race-safe. A pre-flight read could not be: two concurrent requests would
    // both pass it and one would still fail here.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { success: false, error: "This conversation already has a ticket" },
        { status: 409 }
      );
    }

    console.error("[TICKETS]", error);

    return NextResponse.json(
      { success: false, error: "Failed to create ticket" },
      { status: 500 }
    );
  }
}
