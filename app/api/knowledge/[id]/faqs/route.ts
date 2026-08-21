// ============================================================================
// MODULE : Per-document FAQs
// ROUTE  : /api/knowledge/[id]/faqs
//
// METHODS
// GET    - Return the FAQs already generated for one document (no model call)
// POST   - Generate them, or regenerate with { force: true }.
//          { mode: "questions" } proposes questions WITHOUT answering them, for
//          the editor that fills them in one at a time.
// PUT    - Store an edited list verbatim. No model call, so no billing gate:
//          rewording a question the user typed is not an AI request.
//
// ACCESS
// All   - Signed-in members of the tenant, scoped to the active business.
// ============================================================================
//
// Generation is a model call, so it is a POST and it is metered. GET is free —
// it only reads the copy cached on `metadata`. Most documents never need either:
// the ingest worker generates the FAQs once, as part of indexing, and the
// knowledge-base list renders them straight off the row it already fetched. This
// route is for the two cases that leaves — a document indexed before FAQs
// existed, and a set the user wants rewritten.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";
import { guardAgentAi, guardFeature, guardLimit } from "@/lib/billing/guard";
import { incrementAiUsage } from "@/lib/billing/usage";
import { mergeFaqMetadata, readFaqState } from "@/lib/knowledgeFaq";
import { generateDocFaqs, proposeFaqQuestions, resolveCorpus } from "@/lib/knowledgeFaq.server";
import { fetchDocumentText } from "@/lib/rag";
import { proposeQuestionsSchema, saveFaqsSchema } from "@/lib/validators/knowledgeFaq";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const doc = await prisma.knowledgeDoc.findFirst({
      where: { id, tenantId: scope.tenantId, businessId: scope.businessId },
      select: { id: true, metadata: true, isIndexed: true },
    });
    if (!doc) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });

    return NextResponse.json({ success: true, data: readFaqState(doc.metadata) });
  } catch (error) {
    console.error("[KNOWLEDGE FAQ GET]", error);
    return NextResponse.json({ success: false, error: "Failed to load FAQs" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, businessId } = scope;

  // Drafting FAQs is an AI call against a knowledge document, so both gates apply.
  const denied =
    (await guardFeature(tenantId, "aiEnabled")) ??
    (await guardLimit(tenantId, "ai")) ??
    (await guardAgentAi(tenantId, scope.userId));
  if (denied) return denied;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const force = (body as { force?: boolean }).force === true;
    const mode = (body as { mode?: string }).mode;

    const doc = await prisma.knowledgeDoc.findFirst({
      where: { id, tenantId, businessId },
      select: { id: true, name: true, content: true, metadata: true, isIndexed: true },
    });
    if (!doc) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });

    const settingsForMode = await prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { aiModel: true },
    });

    // Questions only. Nothing is persisted here — an unanswered list belongs to
    // the editor until the user keeps it, and writing it would overwrite the
    // answered set already on the card the moment someone clicked "suggest more"
    // and then changed their mind.
    if (mode === "questions") {
      const parsed = proposeQuestionsSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
      }

      const corpus = await resolveCorpus(tenantId, [doc]);
      // The style on the request wins over the stored one: the editor sends what
      // is on screen, and the admin may have just changed it without saving.
      const style = parsed.data.style ?? readFaqState(doc.metadata).style;
      try {
        const result = await proposeFaqQuestions({
          label: doc.name,
          corpus,
          count: parsed.data.count,
          existing: parsed.data.existing,
          style,
          model: settingsForMode?.aiModel,
        });
        await incrementAiUsage(tenantId, 1, scope.userId);
        return NextResponse.json({ success: true, data: result });
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Could not suggest questions";
        return NextResponse.json({ success: false, error: reason }, { status: 422 });
      }
    }

    // Cached unless the caller explicitly asked for a rewrite. Without this the
    // UI's retry-on-error path would re-bill a document that already has FAQs.
    const cached = readFaqState(doc.metadata);
    if (cached.faqs.length > 0 && !force) {
      return NextResponse.json({ success: true, data: cached, cached: true });
    }

    const settings = settingsForMode;

    // Documents indexed before the upload route persisted extracted text carry `content = null`
    // while being perfectly well indexed — their text survives only as the payload on their
    // vectors. Reading it back from there is what lets an old PDF generate FAQs at all; without
    // it every pre-existing document reports that it has no text.
    const content =
      doc.content?.trim() || (await fetchDocumentText(tenantId, doc.id));

    let faqs;
    let truncated = false;
    try {
      ({ faqs, truncated } = await generateDocFaqs({
        name: doc.name,
        content,
        model: settings?.aiModel,
      }));
    } catch (error) {
      // Recorded on the document so the card can explain itself instead of
      // showing an empty FAQ list that looks like the document had no questions.
      const reason = error instanceof Error ? error.message : "FAQ generation failed";
      await prisma.knowledgeDoc.update({
        where: { id: doc.id },
        data: { metadata: mergeFaqMetadata(doc.metadata, { error: reason }) },
      });
      return NextResponse.json({ success: false, error: reason }, { status: 422 });
    }

    const generatedAt = new Date().toISOString();
    await prisma.knowledgeDoc.update({
      where: { id: doc.id },
      data: { metadata: mergeFaqMetadata(doc.metadata, { faqs, generatedAt, truncated }) },
    });
    await incrementAiUsage(tenantId, 1, scope.userId);

    return NextResponse.json({ success: true, data: { faqs, generatedAt, truncated } });
  } catch (error) {
    console.error("[KNOWLEDGE FAQ POST]", error);
    return NextResponse.json({ success: false, error: "Failed to generate FAQs" }, { status: 500 });
  }
}

/**
 * Store the list as the user edited it.
 *
 * Deliberately not metered and not gated on `aiEnabled`: nothing here calls a
 * model. This is how a reworded question, a deleted row and a hand-written
 * question are saved, and a workspace that has run out of AI credits must still
 * be able to fix a wrong answer by typing over it.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, businessId } = scope;

  try {
    const { id } = await params;
    const doc = await prisma.knowledgeDoc.findFirst({
      where: { id, tenantId, businessId },
      select: { id: true, metadata: true },
    });
    if (!doc) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });

    const parsed = saveFaqsSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const updated = await prisma.knowledgeDoc.update({
      where: { id: doc.id },
      data: {
        metadata: mergeFaqMetadata(doc.metadata, {
          faqs: parsed.data.faqs,
          style: parsed.data.style,
        }),
      },
      select: { metadata: true },
    });

    return NextResponse.json({ success: true, data: readFaqState(updated.metadata) });
  } catch (error) {
    console.error("[KNOWLEDGE FAQ PUT]", error);
    return NextResponse.json({ success: false, error: "Failed to save FAQs" }, { status: 500 });
  }
}
