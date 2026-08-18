// ============================================================================
// MODULE : Per-document FAQs
// ROUTE  : /api/knowledge/[id]/faqs
//
// METHODS
// GET    - Return the FAQs already generated for one document (no model call)
// POST   - Generate them, or regenerate with { force: true }
//
// ACCESS
// Both  - Signed-in members of the tenant, scoped to the active business.
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
import { guardFeature, guardLimit } from "@/lib/billing/guard";
import { incrementAiUsage } from "@/lib/billing/usage";
import { mergeFaqMetadata, readFaqState } from "@/lib/knowledgeFaq";
import { generateDocFaqs } from "@/lib/knowledgeFaq.server";
import { fetchDocumentText } from "@/lib/rag";

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
  const denied = (await guardFeature(tenantId, "aiEnabled")) ?? (await guardLimit(tenantId, "ai"));
  if (denied) return denied;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const force = (body as { force?: boolean }).force === true;

    const doc = await prisma.knowledgeDoc.findFirst({
      where: { id, tenantId, businessId },
      select: { id: true, name: true, content: true, metadata: true, isIndexed: true },
    });
    if (!doc) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });

    // Cached unless the caller explicitly asked for a rewrite. Without this the
    // UI's retry-on-error path would re-bill a document that already has FAQs.
    const cached = readFaqState(doc.metadata);
    if (cached.faqs.length > 0 && !force) {
      return NextResponse.json({ success: true, data: cached, cached: true });
    }

    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { aiModel: true },
    });

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
    await incrementAiUsage(tenantId);

    return NextResponse.json({ success: true, data: { faqs, generatedAt, truncated } });
  } catch (error) {
    console.error("[KNOWLEDGE FAQ POST]", error);
    return NextResponse.json({ success: false, error: "Failed to generate FAQs" }, { status: 500 });
  }
}
