// ============================================================================
// OWNER  : Gauransh
// MODULE : AI auto-reply worker
// ROUTE  : /api/workers/ai-reply
//
// METHODS
// POST   - Draft and send one AI auto-reply, delivered by QStash
//
// ACCESS
// POST   - Public. Authenticated by the `upstash-signature` header, verified against
//          the QStash signing keys. Unsigned requests are refused with 401.
// ============================================================================
//
// Drafting a reply is the slowest thing the inbound pipeline does — a RAG lookup plus a model
// call of three to eight seconds, then a Meta send — and it is what pushed the webhook past
// Meta's timeout into the retry loop that produced duplicate replies. It runs here instead.
//
// The drafting logic itself is not duplicated: `handleAutoReply` in lib/inbound.ts is the same
// function that ran inline before, and still runs inline when SKIP_QUEUE is set. This route only
// rebuilds the arguments it needs from the ids the job carries.
//
// `applyDelay: false` is passed because the wait has already happened. QStash was given the
// tenant's `autoReplyDelay` as the job's delivery delay, so it held the message for exactly that
// long before calling us; sleeping again here would double the customer's wait and hold the
// function open for no reason.

import { NextRequest, NextResponse } from "next/server";
import { MessageDirection } from "@prisma/client";
import { verifyQStashSignature } from "@/lib/qstash-verify";
import { handleAutoReply, resolveTenantById } from "@/lib/inbound";
import { prisma } from "@/lib/prisma";
import type { AiReplyJob } from "@/lib/queue";

export async function POST(req: NextRequest) {
  const valid = await verifyQStashSignature(req);
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const job = (await req.json()) as AiReplyJob;

  // The two phases below are separated for one reason: whether a failure can be retried safely.
  //
  // Everything in the setup phase happens strictly before anything is sent, so a failure there
  // has left no trace on the customer and asking QStash to redeliver is free. Once
  // `handleAutoReply` is entered that stops being true — it sends to Meta and only then records
  // the outbound message, so a failure after the send is indistinguishable, from out here, from a
  // failure before it. Retrying that would put a second reply in front of the customer, which is
  // the exact duplicate-reply problem this queue was introduced to eliminate. So the send phase
  // never asks for a redelivery, and the setup phase always may.
  let tenant: Awaited<ReturnType<typeof resolveTenantById>>;
  let conversation: Awaited<ReturnType<typeof prisma.conversation.findUnique>>;
  let contact: Awaited<ReturnType<typeof prisma.contact.findUnique>>;

  try {
    tenant = await resolveTenantById(job.tenantId, job.businessId);

    // Both rows are read back rather than carried on the job: a queued reply can be delivered
    // seconds after the message that triggered it, and the thread may have been assigned,
    // resolved or renamed in between. The ids are the stable part, so they are what travels.
    conversation = await prisma.conversation.findUnique({
      where: { id: job.conversationId },
    });
    contact = await prisma.contact.findUnique({
      where: { phone_businessId: { phone: job.contactPhone, businessId: job.businessId } },
    });

    // Idempotency guard. QStash delivers at-least-once independently of retries — a response we
    // sent that never reached QStash is enough to have the same job delivered twice — and a
    // WhatsApp message cannot be recalled, so the worker has to recognise work it has already
    // done rather than rely on being called once.
    //
    // The question asked is "has an AI reply already gone out since the message this job answers
    // arrived?". The triggering message is located by its Meta id, which is unique, and any
    // AI-authored outbound message in the thread at or after that instant is proof the turn has
    // been answered. A missing trigger row means the inbound message was deleted; there is
    // nothing to answer and nothing to be idempotent about, so the send is simply skipped.
    const trigger = await prisma.message.findUnique({
      where: { waMessageId: job.waMessageId },
      select: { createdAt: true },
    });

    if (trigger) {
      const alreadyReplied = await prisma.message.findFirst({
        where: {
          conversationId: job.conversationId,
          direction: MessageDirection.OUTBOUND,
          isAiGenerated: true,
          createdAt: { gte: trigger.createdAt },
        },
        select: { id: true },
      });

      if (alreadyReplied) {
        console.warn(
          `[WORKER AI-REPLY] Conversation ${job.conversationId} already answered since message ${job.waMessageId} — skipping duplicate`
        );
        return NextResponse.json({ ok: true, skipped: "already replied" });
      }
    }
  } catch (error) {
    console.error(
      `[WORKER AI-REPLY] Could not load context for conversation ${job.conversationId}:`,
      error
    );
    // Nothing has been sent, so a redelivery is safe and is worth asking for.
    return NextResponse.json({ error: "Context load failed" }, { status: 500 });
  }

  // A conversation or contact deleted between enqueue and delivery is not a failure to retry —
  // there is nothing left to reply to, and redelivering would never find them either.
  if (!conversation || !contact) {
    console.warn(
      `[WORKER AI-REPLY] Conversation ${job.conversationId} or contact ${job.contactPhone} no longer exists — skipping`
    );
    return NextResponse.json({ ok: true });
  }

  try {
    await handleAutoReply(tenant, conversation, contact, false);
  } catch (error) {
    // Answered 2xx on purpose. `handleAutoReply` contains its own generation and send failures,
    // so an error escaping it means the send had already succeeded and the bookkeeping after it
    // did not — the customer has their reply and only our record of it is missing. A retry could
    // not repair the record, and would send the reply again.
    console.error(
      `[WORKER AI-REPLY] Reply on conversation ${job.conversationId} failed after sending; not retrying:`,
      error
    );
    return NextResponse.json({ ok: true, recorded: false });
  }

  return NextResponse.json({ ok: true });
}
