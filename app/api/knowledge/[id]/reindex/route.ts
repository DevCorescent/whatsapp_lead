import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";
import { guardFeature } from "@/lib/billing/guard";
import { deleteDocumentVectors } from "@/lib/rag";
import { publishKnowledgeIngest } from "@/lib/queue";

/**
 * Force re-index a knowledge document.
 *
 * Documents uploaded before business-scoped Qdrant payloads were introduced may
 * have vectors that lack `businessId`. Since retrieval filters on BOTH tenantId
 * AND businessId, those documents return zero results even though they appear
 * indexed. This endpoint lets a user reset and re-queue them without having to
 * re-upload the file.
 *
 * The worker uses `doc.content` (the extracted text saved at upload time) so no
 * re-parsing or extra API calls happen — it is a pure re-embed from stored text.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  const noRag = await guardFeature(tenantId, "ragEnabled");
  if (noRag) return noRag;

  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const doc = await prisma.knowledgeDoc.findFirst({
      where: { id, tenantId, businessId: scope.businessId },
      select: { id: true, name: true, content: true },
    });
    if (!doc) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });

    if (!doc.content) {
      return NextResponse.json(
        { success: false, error: "This document has no stored text — please re-upload the file to re-index it." },
        { status: 422 },
      );
    }

    // Delete stale vectors first (they may lack businessId in their Qdrant payload).
    // If none exist the delete is a no-op.
    await deleteDocumentVectors(tenantId, scope.businessId, id);

    // Reset the flag so the worker re-indexes instead of skipping.
    await prisma.knowledgeDoc.update({
      where: { id },
      data: {
        isIndexed: false,
        chunkCount: 0,
        vectorIds: [],
        metadata: { status: "PROCESSING" },
      },
    });

    await publishKnowledgeIngest({ tenantId, businessId: scope.businessId, docId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[KNOWLEDGE REINDEX]", error);
    return NextResponse.json({ success: false, error: "Failed to re-index document" }, { status: 500 });
  }
}
