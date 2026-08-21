// ============================================================================
// MODULE : Recording FAQ taps (server)
// ============================================================================
//
// Called from the inbound webhook when a customer taps a row in a FAQ menu we
// sent. Two things happen: the tap is stored as an intent signal, and the answer
// the tenant curated is sent straight back.
//
// The answer costs no model call and no AI credit — it is text a human approved.
// That is the point of the feature: the highest-intent questions get the most
// reliable answers, and the AI is left for everything else.

import { prisma } from "@/lib/prisma";
import {
  FAQ_INTENT_POINTS,
  readFaqIntent,
  readFaqList,
  readFaqState,
  type DocFaq,
  type FaqIntent,
} from "@/lib/knowledgeFaq";
import { parseFaqRowId, type FaqReplyRef } from "@/lib/knowledgeFaqSend";
import { applyIntentToLead } from "@/lib/leadSignal";

/** The questions a collection currently holds, or null when it is gone. */
async function loadFaqs(
  tenantId: string,
  businessId: string,
  ref: FaqReplyRef,
): Promise<DocFaq[] | null> {
  if (ref.kind === "document") {
    const doc = await prisma.knowledgeDoc.findFirst({
      where: { id: ref.sourceId, tenantId, businessId },
      select: { metadata: true },
    });
    return doc ? readFaqState(doc.metadata).faqs : null;
  }

  const set = await prisma.knowledgeFaqSet.findFirst({
    where: { id: ref.sourceId, tenantId, businessId },
    select: { faqs: true },
  });
  return set ? readFaqList(set.faqs) : null;
}

export interface FaqTapResult {
  question: string;
  /** The curated answer to send back, or null when it can no longer be resolved. */
  answer: string | null;
  intent: FaqIntent;
  /** Points added to the contact's open lead, or 0 when there was none to move. */
  scored: number;
}

export async function recordFaqTap(params: {
  tenantId: string;
  businessId: string;
  contactId: string;
  conversationId: string;
  /** `interactive.list_reply.id` from the inbound payload. */
  replyId: string | null | undefined;
  /** The title Meta echoed — a truncated fallback if the list has since changed. */
  replyTitle?: string | null;
}): Promise<FaqTapResult | null> {
  const ref = parseFaqRowId(params.replyId);
  if (!ref) return null;

  try {
    const faqs = await loadFaqs(params.tenantId, params.businessId, ref);
    const hit = faqs?.[ref.index] ?? null;

    // The title Meta sends is capped at 24 characters, so it is only ever a
    // fallback for the record — never the thing we answer from.
    const question = hit?.question ?? params.replyTitle?.trim() ?? "";
    if (!question) return null;

    const intent = readFaqIntent(hit?.intent);
    const points = FAQ_INTENT_POINTS[intent];

    await prisma.faqInteraction.create({
      data: {
        tenantId: params.tenantId,
        businessId: params.businessId,
        contactId: params.contactId,
        conversationId: params.conversationId,
        question,
        sourceKind: ref.kind,
        sourceId: ref.sourceId,
        intent,
        points,
      },
    });

    // Shared with the IVR menu path — see lib/leadSignal.ts. The two are the
    // same event to a sales team, so they must score the same way.
    const scored = await applyIntentToLead({
      tenantId: params.tenantId,
      contactId: params.contactId,
      reason: `Asked "${question}"`,
      points,
      activityType: "FAQ_INTEREST",
    });

    return { question, answer: hit?.answer?.trim() || null, intent, scored };
  } catch (error) {
    console.error("[FAQ TAP] Failed to record interaction:", error);
    return null;
  }
}
