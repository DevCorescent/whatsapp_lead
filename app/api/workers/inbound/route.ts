// ============================================================================
// OWNER  : Gauransh
// MODULE : Inbound message worker
// ROUTE  : /api/workers/inbound
//
// METHODS
// POST   - Process one inbound WhatsApp message delivered by QStash
//
// ACCESS
// POST   - Public. Authenticated by the `upstash-signature` header, verified against
//          the QStash signing keys. Unsigned requests are refused with 401.
// ============================================================================
//
// The ingestion work that used to run inline in the WhatsApp webhook runs here instead, off
// the request Meta is waiting on. The pipeline itself is unchanged and is not duplicated —
// this route resolves the tenant from the ids the job carries and hands straight over to
// `processIncomingMessage` in lib/inbound.ts, which the webhook also calls when SKIP_QUEUE
// is set for local development.
//
// QStash delivers at-least-once, so this route can legitimately be called twice for the same
// message. Idempotency is not re-implemented here: `Message.waMessageId` is unique, and
// `saveInboundMessage` returns `isNew: false` on the duplicate, which is what already gates
// the read receipt, the broadcast, the campaign credit and the reply. A redelivery therefore
// costs a few queries and sends nothing.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateTenantCache } from "@/lib/cache";
import { verifyQStashSignature } from "@/lib/qstash-verify";
import {
  processIncomingMessage,
  resolveTenant,
  resolveTenantById,
} from "@/lib/inbound";
import type { InboundMessageJob } from "@/lib/queue";

export async function POST(req: NextRequest) {
  // 1. Verify this came from QStash. This route sends WhatsApp messages and spends model
  //    tokens, so an unauthenticated caller must never reach the pipeline below.
  const valid = await verifyQStashSignature(req);
  if (!valid) {
    console.warn("[WORKER INBOUND] Unauthorized — missing or invalid QStash signature");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const job = (await req.json()) as InboundMessageJob;

  console.log("[WORKER INBOUND] Processing job", {
    waMessageId: job.waMessageId,
    from: job.from,
    tenantId: job.tenantId,
    businessId: job.businessId,
    phoneNumberId: job.phoneNumberId,
    type: job.type,
  });

  try {
    // Stale jobs (and old synthesised `biz_${tenantId}` ids) can name a business that no longer
    // exists. Re-resolve from the Meta phone_number_id rather than FK-failing the contact write.
    let businessId = job.businessId;
    const businessExists = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true },
    });

    let tenant;
    if (!businessExists) {
      console.warn("[WORKER INBOUND] businessId missing — re-resolving from phoneNumberId", {
        waMessageId: job.waMessageId,
        badBusinessId: job.businessId,
        phoneNumberId: job.phoneNumberId,
        tenantId: job.tenantId,
      });
      await invalidateTenantCache(job.phoneNumberId);
      tenant = await resolveTenant(job.phoneNumberId);
      businessId = tenant.businessId;
    } else {
      tenant = await resolveTenantById(job.tenantId, businessId);
    }

    // 2. The ingestion spine, unchanged: contact → conversation → message, then the reactions
    //    (read receipt, broadcast, campaign credit, flow engine, and the AI reply which
    //    `dispatchAutoReply` publishes on to /api/workers/ai-reply rather than running here).
    const result = await processIncomingMessage(tenant, job.rawMessage, job.contactName);

    console.log("[WORKER INBOUND] Message processed successfully", {
      waMessageId: job.waMessageId,
      tenantId: job.tenantId,
      businessId,
      businessName: businessExists?.name ?? null,
      contactId: result.contact.id,
      conversationId: result.conversation.id,
      messageId: result.message.id,
    });
  } catch (error) {
    console.error(
      `[WORKER INBOUND] Failed to process message ${job.waMessageId}:`,
      error
    );
    // Non-2xx tells QStash to retry. The unique constraint on waMessageId makes that safe:
    // whatever committed before the failure is recognised as a duplicate on the way back through.
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
