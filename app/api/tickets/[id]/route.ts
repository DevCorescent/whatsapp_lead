// ============================================================================
// OWNER  : Gauransh
// MODULE : Support
// ROUTE  : /api/tickets/[id]
//
// METHODS
// PATCH  - Move a ticket through its lifecycle, reassign it, or reprioritise it
//
// ACCESS
// PATCH  - Authenticated. Scoped to session.user.tenantId; a ticket owned by another
//          workspace answers 404, exactly as a non-existent one does. Only status,
//          priority, assignedToId, department and slaDeadline are writable; any other
//          field in the body is rejected rather than ignored.
// ============================================================================
//
// Only PATCH is exposed. GET and DELETE are deliberately absent: nothing in the product reads a
// single ticket in isolation — the list carries every column the detail view draws — and a ticket is
// the record of a customer having asked for help, which is not something an agent should be able to
// erase. Adding either later is a decision, not an oversight.

import { NextRequest, NextResponse } from "next/server";
import { Prisma, TicketPriority, TicketStatus } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Columns returned after an update. Mirrors the list so the client can patch a row in place. */
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
} satisfies Prisma.TicketSelect;

/**
 * The only five fields a ticket exposes for update.
 *
 * `strictObject` is the enforcement, not the documentation. A permissive object would let `subject`,
 * `tenantId`, `conversationId`, `resolvedAt` or `closedAt` ride along in the body — silently dropped
 * today, silently applied the first time someone spreads the parsed result into a Prisma `data`.
 * `resolvedAt` and `closedAt` in particular must never be client-writable: they are the timestamps a
 * support SLA is measured against, and a caller able to set them could report work as finished before
 * it was done. They are derived server-side instead — see `resolveLifecycleTimestamps`.
 *
 * `assignedToId` and `department` are nullable because clearing them is a real action: returning a
 * ticket to the unclaimed queue is not the same as leaving it alone, and only `null` can say so. An
 * omitted key means "do not touch", which is exactly how Prisma reads `undefined`, so omitted fields
 * are never overwritten.
 *
 * `slaDeadline` is coerced because a JSON body carries an ISO string, not a Date. An unparseable
 * value fails validation rather than reaching Postgres as an Invalid Date.
 *
 * The refinement rejects an empty body: it would otherwise issue a write that changes nothing but
 * `updatedAt`, silently reordering any list sorted by it.
 */
const updateTicketSchema = z
  .strictObject({
    status: z.nativeEnum(TicketStatus).optional(),
    priority: z.nativeEnum(TicketPriority).optional(),
    assignedToId: z.string().min(1).nullable().optional(),
    department: z.string().trim().min(1).nullable().optional(),
    slaDeadline: z.coerce.date().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message:
      "Provide at least one of: status, priority, assignedToId, department, slaDeadline",
  });

type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

/**
 * Resolve a ticket while enforcing tenant isolation.
 *
 * `findFirst`, never `findUnique`. `id` is a cuid and unique on its own, so `findUnique({ id })`
 * would happily return another workspace's ticket — uniqueness identifies a row, it does not
 * authorise access to it. Folding `tenantId` into the predicate makes a foreign ticket
 * indistinguishable from one that does not exist, which is the only answer that leaks nothing: a
 * distinct 403 would confirm the row is real and tell the caller they had found something.
 *
 * Selects only what the update branches on. The current status is needed to tell a real lifecycle
 * transition from a no-op that names the status the ticket is already in, and nothing else is.
 */
async function resolveTicket(tenantId: string, ticketId: string) {
  return prisma.ticket.findFirst({
    where: { id: ticketId, tenantId },
    select: { id: true, status: true },
  });
}

/**
 * Confirm an assignee is an active member of this tenant.
 *
 * `assignedToId` lands in a foreign key the database constrains only to *some* User — not to a user
 * of *this* workspace. Without this check an agent could hand their ticket to someone in another
 * tenant, who would then own a support request they cannot see. Postgres will not catch a
 * cross-tenant reference here, so it has to be caught before the write.
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
 * Derive the lifecycle timestamps a status change implies.
 *
 * `resolvedAt` and `closedAt` are columns the schema provides and nothing else would ever fill.
 * Leaving them null forever would make them dead weight, and would leave the support SLA — the whole
 * reason `slaDeadline` exists — unmeasurable: a deadline with no completion time to compare against
 * answers no question.
 *
 * They are stamped here rather than accepted from the client for the same reason `scoreLabel` is
 * derived in the Leads module: a timestamp the caller controls is a timestamp the caller can
 * backdate, and "resolved before the SLA" is exactly the claim someone would want to falsify.
 *
 * Only a genuine transition stamps. Re-sending RESOLVED for a ticket already resolved must not move
 * the clock forward — the ticket was resolved when it was resolved, not when someone last clicked.
 * And a ticket reopened out of RESOLVED clears the stamp, because it is no longer resolved and a
 * stale timestamp would say otherwise.
 *
 * Returns a partial update so the caller can spread it into the write it is already making, rather
 * than issuing a second one.
 */
function resolveLifecycleTimestamps(
  currentStatus: TicketStatus,
  nextStatus: TicketStatus | undefined
): { resolvedAt?: Date | null; closedAt?: Date | null } {
  if (nextStatus === undefined || nextStatus === currentStatus) return {};

  if (nextStatus === TicketStatus.RESOLVED) return { resolvedAt: new Date() };
  if (nextStatus === TicketStatus.CLOSED) return { closedAt: new Date() };

  // Moving back into an active state: the ticket is no longer finished, so the timestamps that said
  // it was must not survive the reopening.
  return { resolvedAt: null, closedAt: null };
}

/**
 * Apply the update.
 *
 * A single write to a single row, so no transaction: one statement is already atomic, and wrapping it
 * would pin a connection to express a guarantee Postgres gives for free. The derived timestamps ride
 * in the same `data` rather than in a second statement, which is what keeps them from ever
 * disagreeing with the status they describe.
 *
 * Keyed by `id` alone because ownership was proved by `resolveTicket` — re-deriving the tenant here
 * would issue the same read twice, and a ticket cannot change tenants between the two statements.
 */
async function updateTicket(
  ticketId: string,
  currentStatus: TicketStatus,
  input: UpdateTicketInput
) {
  return prisma.ticket.update({
    where: { id: ticketId },
    data: {
      status: input.status,
      priority: input.priority,
      assignedToId: input.assignedToId,
      department: input.department,
      slaDeadline: input.slaDeadline,
      ...resolveLifecycleTimestamps(currentStatus, input.status),
    },
    select: TICKET_SELECT,
  });
}

/**
 * Move a ticket through its lifecycle, reassign it, or reprioritise it.
 *
 * Ownership is proved before the body is trusted, and the assignee — when one is named — is proved
 * before the write. Neither can be inferred from the request.
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

    const parsed = updateTicketSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // Resolved before the write and reused: the current status is what tells a real transition from a
    // request that names the status the ticket is already in.
    const ticket = await resolveTicket(tenantId, id);
    if (!ticket) {
      return NextResponse.json(
        { success: false, error: "Ticket not found" },
        { status: 404 }
      );
    }

    const { assignedToId } = parsed.data;

    // Null is an unassignment and needs no owner to verify; a named assignee does.
    if (assignedToId && !(await isAssignableUser(tenantId, assignedToId))) {
      return NextResponse.json(
        {
          success: false,
          error: "Assignee is not an active member of this workspace",
        },
        { status: 400 }
      );
    }

    const updated = await updateTicket(ticket.id, ticket.status, parsed.data);

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    // Prisma's errors name columns and query shapes; the caller learns only that the write failed.
    console.error("[TICKETS]", error);

    return NextResponse.json(
      { success: false, error: "Failed to update ticket" },
      { status: 500 }
    );
  }
}
