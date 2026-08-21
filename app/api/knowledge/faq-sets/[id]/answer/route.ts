// ============================================================================
// MODULE : Answer one question in a multi-document set
// ROUTE  : POST /api/knowledge/faq-sets/[id]/answer
//
// ACCESS : Signed-in members of the tenant, scoped to the active business.
// ============================================================================
//
// The multi-document twin of /api/knowledge/[id]/faqs/answer. The one difference
// that matters: with several documents in play the answer carries a `source`, so
// a claim can be traced back to the file it came from rather than to "the
// knowledge base".

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";
import { guardAgentAi, guardFeature, guardLimit } from "@/lib/billing/guard";
import { incrementAiUsage } from "@/lib/billing/usage";
import { readFaqStyle, toJsonFaqs, toJsonStyle, type DocFaq } from "@/lib/knowledgeFaq";
import { loadFaqSet, presentFaqSet } from "@/lib/knowledgeFaqSet";
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
    const found = await loadFaqSet(tenantId, businessId, id);
    if (!found) return NextResponse.json({ success: false, error: "FAQ set not found" }, { status: 404 });
    if (found.docs.length === 0) {
      return NextResponse.json(
        { success: false, error: "Every document in this set has been deleted." },
        { status: 409 },
      );
    }

    const parsed = answerFaqSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { index, faqs } = parsed.data;

    const rows = await prisma.knowledgeDoc.findMany({
      where: { id: { in: found.docs.map((d) => d.id) }, tenantId, businessId },
      select: { id: true, name: true, content: true },
    });

    const [settings, corpus] = await Promise.all([
      prisma.tenantSettings.findUnique({ where: { tenantId }, select: { aiModel: true } }),
      resolveCorpus(tenantId, rows),
    ]);

    const style = parsed.data.style ?? readFaqStyle(found.set.style);

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

    const next: DocFaq[] = faqs.map((faq, i) =>
      i === index
        ? {
            ...faq,
            answer: answered.answer,
            // Rewritten, never merged: a citation left over from the question's
            // previous wording would point at the wrong file, so an answer the
            // model would not attribute clears the old source rather than
            // inheriting it.
            source: answered.source,
          }
        : faq,
    );

    const updated = await prisma.knowledgeFaqSet.update({
      where: { id: found.set.id },
      data: { faqs: toJsonFaqs(next), error: null, style: toJsonStyle(style) },
    });
    await incrementAiUsage(tenantId, 1, scope.userId);

    return NextResponse.json({
      success: true,
      data: {
        index,
        item: next[index],
        set: presentFaqSet(updated, new Map(found.docs.map((d) => [d.id, d]))),
      },
    });
  } catch (error) {
    console.error("[FAQ SET ANSWER]", error);
    return NextResponse.json({ success: false, error: "Failed to answer this question" }, { status: 500 });
  }
}
