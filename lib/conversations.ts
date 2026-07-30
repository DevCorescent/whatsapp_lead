// ============================================================================
// MODULE : Conversation resolution
// ============================================================================
//
// One question, one answer: which conversation does a contact's next message belong to?
//
// Two callers ask it — the WhatsApp ingestion pipeline (lib/inbound.ts) when a customer writes in,
// and POST /api/conversations when an agent presses "Message" on a saved contact. They must agree,
// or the same contact ends up with one thread the customer is talking into and another the agent is
// typing into. So the rule lives here rather than in either of them.
//
// It sits in its own module rather than inside lib/inbound.ts because that file reaches for the AI
// SDK, the vector store, the queue and the realtime client at import time. A route that only needs
// to resolve a row should not drag all of that into its bundle.

import type { Conversation } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * A resolved thread, and whether resolving it had to create one.
 *
 * `created` exists because the two callers answer differently: the API reports 201 vs 200 so the
 * client can tell "started a conversation" from "opened the existing one". Returning it from here
 * rather than having the caller re-run the same lookup keeps one query, and one copy of the
 * matching rule, instead of two that could drift.
 */
export interface ResolvedConversation {
  conversation: Conversation;
  created: boolean;
}

/**
 * Resolve the conversation an inbound or outbound message belongs to, opening one on first contact.
 *
 * A contact's messages must land in a single thread rather than fragmenting into a new conversation
 * per delivery, so an existing thread is always reused when one is present. Ordering by `createdAt`
 * desc makes the choice deterministic in the event that historical data already holds more than one
 * row for the pair — the newest thread wins.
 *
 * The lookup is scoped by `businessId` as well as `contactId`. The inbox lists conversations of the
 * *active* business, so a thread stored against a different business than the contact it belongs to
 * is invisible in the product while sitting correctly in the database — which is how a message can
 * arrive, be persisted, and appear nowhere. Matching on the pair means the thread this returns is
 * always one that business's own inbox will render.
 *
 * Only the three ids are supplied on create. Every other column the inbox relies on is defaulted by
 * the schema (`status` → OPEN, `channel` → WHATSAPP, `unreadCount` → 0); restating them here would
 * duplicate the schema's intent in application code and drift from it. `lastMessageAt` and
 * `lastMessagePreview` stay null until a message is actually persisted — that is the message
 * writer's responsibility, not this helper's.
 *
 * Caveat: `Conversation` carries no unique constraint on `(businessId, contactId)`, so this cannot
 * be expressed as an `upsert` the way `upsertContact` can. Two Meta deliveries racing for a
 * brand-new contact can therefore both miss the read and both create a thread. The schema is the
 * only place that could close this, and changing it is out of scope.
 *
 * @param tenantId - Owning tenant.
 * @param businessId - The workspace the thread belongs to.
 * @param contactId - The contact the thread is with.
 * @returns The existing or newly created Conversation — including its flow-session columns — and
 *   whether it had to be created.
 */
export async function findOrCreateConversation(
  tenantId: string,
  businessId: string,
  contactId: string
): Promise<ResolvedConversation> {
  const existing = await prisma.conversation.findFirst({
    where: { tenantId, businessId, contactId },
    orderBy: { createdAt: "desc" },
  });

  if (existing) return { conversation: existing, created: false };

  return {
    conversation: await prisma.conversation.create({
      data: { tenantId, businessId, contactId },
    }),
    created: true,
  };
}
