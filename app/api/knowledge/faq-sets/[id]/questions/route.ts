// ============================================================================
// MODULE : Propose questions across a set's documents
// ROUTE  : POST /api/knowledge/faq-sets/[id]/questions
//
// ACCESS : Signed-in members of the tenant, scoped to the active business.
// ============================================================================
//
// Questions only, never answers. Nothing is persisted: an unanswered list belongs
// to the editor until the user keeps it, and writing it here would wipe the
// answered set the moment someone asked for more suggestions and changed their
// mind.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";
import { guardAgentAi, guardFeature, guardLimit } from "@/lib/billing/guard";
import { incrementAiUsage } from "@/lib/billing/usage";
import { loadFaqSet } from "@/lib/knowledgeFaqSet";
import { readFaqStyle, toJsonStyle } from "@/lib/knowledgeFaq";
import { proposeFaqQuestions, resolveCorpus } from "@/lib/knowledgeFaq.server";
import { proposeQuestionsSchema } from "@/lib/validators/knowledgeFaq";

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

    const parsed = proposeQuestionsSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const rows = await prisma.knowledgeDoc.findMany({
      where: { id: { in: found.docs.map((d) => d.id) }, tenantId, businessId },
      select: { id: true, name: true, content: true },
    });

    const corpus = await resolveCorpus(tenantId, rows);
    const style = parsed.data.style ?? readFaqStyle(found.set.style);

    try {
      const result = await proposeFaqQuestions({
        label: found.set.name,
        corpus,
        count: parsed.data.count,
        existing: parsed.data.existing,
        style,
        model: (await prisma.tenantSettings.findUnique({ where: { tenantId }, select: { aiModel: true } }))?.aiModel,
      });
      await incrementAiUsage(tenantId, 1, scope.userId);

      // Recorded now rather than at answer time: whether the documents had to be
      // cut is a property of the corpus these questions were drawn from.
      await prisma.knowledgeFaqSet.update({
        where: { id: found.set.id },
        data: { truncated: result.truncated, error: null, style: toJsonStyle(style) },
      });

      return NextResponse.json({ success: true, data: { ...result, sources: corpus.sources } });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Could not suggest questions";
      await prisma.knowledgeFaqSet.update({
        where: { id: found.set.id },
        data: { error: reason },
      });
      return NextResponse.json({ success: false, error: reason }, { status: 422 });
    }
  } catch (error) {
    console.error("[FAQ SET QUESTIONS]", error);
    return NextResponse.json({ success: false, error: "Failed to suggest questions" }, { status: 500 });
  }
}
