// ============================================================================
// MODULE : Answer one FAQ question
// ROUTE  : POST /api/knowledge/[id]/faqs/answer
//
// ACCESS : Signed-in members of the tenant, scoped to the active business.
// ============================================================================
//
// One question, one model call. This is what makes an edited question mean
// something: the user rewrites the wording, and only that row is re-answered
// against the same document — rather than the whole list being regenerated
// around it, which would throw away every other answer they had accepted.
//
// The request carries the WHOLE list and the index to answer, and the whole list
// is what gets stored. See lib/validators/knowledgeFaq.ts for why.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";
import { guardAgentAi, guardFeature, guardLimit } from "@/lib/billing/guard";
import { incrementAiUsage } from "@/lib/billing/usage";
import { mergeFaqMetadata, readFaqState, type DocFaq } from "@/lib/knowledgeFaq";
import { answerFaqQuestion, resolveCorpus } from "@/lib/knowledgeFaq.server";
import { answerFaqSchema } from "@/lib/validators/knowledgeFaq";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, businessId } = scope;

  const denied =
    (await guardFeature(tenantId, "aiEnabled")) ??
    (await guardLimit(tenantId, "ai")) ??
    (await guardAgentAi(tenantId, scope.userId));
  if (denied) return denied;

  try {
    const { id } = await params;
    const doc = await prisma.knowledgeDoc.findFirst({
      where: { id, tenantId, businessId },
      select: { id: true, name: true, content: true, metadata: true },
    });
    if (!doc) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });

    const parsed = answerFaqSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { index, faqs } = parsed.data;

    const [settings, corpus] = await Promise.all([
      prisma.tenantSettings.findUnique({ where: { tenantId }, select: { aiModel: true } }),
      resolveCorpus(tenantId, [doc]),
    ]);

    const style = parsed.data.style ?? readFaqState(doc.metadata).style;

    let answered: { answer: string; source?: string };
    try {
      answered = await answerFaqQuestion({
        question: faqs[index].question,
        corpus,
        style,
        model: settings?.aiModel,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Could not answer this question";
      return NextResponse.json({ success: false, error: reason }, { status: 422 });
    }

    // A single document needs no attribution — there is only one answer to
    // "which file", and printing it on every row would be noise.
    const next: DocFaq[] = faqs.map((faq, i) =>
      i === index ? { ...faq, answer: answered.answer } : faq,
    );

    const updated = await prisma.knowledgeDoc.update({
      where: { id: doc.id },
      data: { metadata: mergeFaqMetadata(doc.metadata, { faqs: next, style }) },
      select: { metadata: true },
    });
    await incrementAiUsage(tenantId, 1, scope.userId);

    return NextResponse.json({
      success: true,
      data: { index, item: next[index], state: readFaqState(updated.metadata) },
    });
  } catch (error) {
    console.error("[KNOWLEDGE FAQ ANSWER]", error);
    return NextResponse.json({ success: false, error: "Failed to answer this question" }, { status: 500 });
  }
}
