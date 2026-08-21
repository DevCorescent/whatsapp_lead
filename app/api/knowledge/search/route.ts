// ============================================================================
// MODULE : Knowledge base retrieval tester
// ROUTE  : POST /api/knowledge/search
//
// ACCESS : Signed-in members of the tenant, scoped to the active business.
// ============================================================================
//
// Runs the exact search an incoming customer message would run, and returns what
// it found instead of feeding it to a model.
//
// Until this existed the only way to learn what the AI retrieves was to have a
// customer ask and read the reply. That made every retrieval setting a guess:
// the score threshold in lib/rag.ts carries a comment recording that 0.4 was
// silently dropping relevant context, which is the kind of thing you can only
// find out by looking. `limit` and `scoreThreshold` are accepted here so both
// can be tried against a real question before anyone changes the default.
//
// Not metered. Retrieval costs one embedding call and is unmetered everywhere
// else in the app; billing it only here would make the diagnostic tool the
// expensive one.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";
import { guardFeature } from "@/lib/billing/guard";
import { RETRIEVAL_LIMIT, RETRIEVAL_SCORE_THRESHOLD, searchKnowledge } from "@/lib/rag";

const searchSchema = z.object({
  query: z.string().trim().min(1, "Type a question first").max(1000),
  limit: z.number().int().min(1).max(20).default(RETRIEVAL_LIMIT),
  // Allowed down to 0 so a search that returns nothing can be re-run with the
  // floor removed — "no match above 0.3" and "no match at all" are different
  // diagnoses, and the second one means the document is not indexed.
  scoreThreshold: z.number().min(0).max(1).default(RETRIEVAL_SCORE_THRESHOLD),
});

export async function POST(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, businessId } = scope;

  const noRag = await guardFeature(tenantId, "ragEnabled");
  if (noRag) return noRag;

  try {
    const parsed = searchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { query, limit, scoreThreshold } = parsed.data;

    if (!process.env.QDRANT_URL) {
      return NextResponse.json(
        { success: false, error: "Vector search is not configured on this deployment." },
        { status: 503 },
      );
    }

    const chunks = await searchKnowledge(tenantId, businessId, query, { limit, scoreThreshold });

    // Names resolved here rather than in lib/rag.ts's `resolveSources`, because
    // this view is per chunk, not per document: the same document appearing
    // three times with three different scores is exactly what the tester is for.
    const docs = await prisma.knowledgeDoc.findMany({
      where: { id: { in: [...new Set(chunks.map((c) => c.docId))] }, tenantId, businessId },
      select: { id: true, name: true, type: true },
    });
    const byId = new Map(docs.map((d) => [d.id, d]));

    return NextResponse.json({
      success: true,
      data: {
        query,
        limit,
        scoreThreshold,
        results: chunks.map((chunk) => ({
          docId: chunk.docId,
          // A chunk whose document was deleted but whose vectors were not is a
          // real state worth seeing, not a row to hide.
          docName: byId.get(chunk.docId)?.name ?? "(deleted document)",
          docType: byId.get(chunk.docId)?.type ?? null,
          chunkIndex: chunk.chunkIndex,
          score: chunk.score,
          text: chunk.text,
        })),
      },
    });
  } catch (error) {
    console.error("[KNOWLEDGE SEARCH]", error);
    return NextResponse.json({ success: false, error: "Search failed" }, { status: 500 });
  }
}
