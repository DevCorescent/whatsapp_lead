// ============================================================================
// OWNER  : Gauransh
// MODULE : Knowledge indexing worker
// ROUTE  : /api/workers/knowledge-ingest
//
// METHODS
// POST   - Chunk, embed and index one knowledge document, delivered by QStash
//
// ACCESS
// POST   - Public. Authenticated by the `upstash-signature` header, verified against
//          the QStash signing keys. Unsigned requests are refused with 401.
// ============================================================================
//
// Indexing used to run inside the upload request: extract → chunk → embed → upsert → insert, all
// before the response. Embedding dominates that — roughly 66ms per chunk, so a 150-chunk document
// held the request for ten seconds and a large PDF for far longer than a serverless function is
// allowed to live. When it timed out the row was never written at all, because the insert came
// last, and whatever vectors had already been upserted were orphaned with no row to delete them by.
//
// Now the route stores the document and returns; this worker does the slow part. The document row
// exists before this runs, so a failure here is visible as a FAILED document rather than as a
// vanished upload.

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { verifyQStashSignature } from "@/lib/qstash-verify";
import { prisma } from "@/lib/prisma";
import { ingestDocument, deleteDocumentVectors } from "@/lib/rag";
import type { KnowledgeIngestJob } from "@/lib/queue";

function mergeMetadata(metadata: unknown, extra: Record<string, unknown>): Prisma.InputJsonValue {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return extra as Prisma.InputJsonValue;
  }

  return { ...(metadata as Record<string, unknown>), ...extra } as Prisma.InputJsonValue;
}

export async function POST(req: NextRequest) {
  const valid = await verifyQStashSignature(req);
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const job = (await req.json()) as KnowledgeIngestJob;

  let existingMetadata: Prisma.InputJsonValue | undefined;

  try {
    // Scoped by tenant *and* business, exactly as the routes that created it are. The job body is
    // signed by QStash, but it is still input — a row is only touched if all three ids agree.
    const doc = await prisma.knowledgeDoc.findFirst({
      where: { id: job.docId, tenantId: job.tenantId, businessId: job.businessId },
      select: { id: true, type: true, content: true, url: true, name: true, isIndexed: true, metadata: true },
    });

    if (!doc) {
      console.warn(`[WORKER KB] Document ${job.docId} no longer exists — skipping`);
      return NextResponse.json({ ok: true });
    }

    existingMetadata = doc.metadata as Prisma.InputJsonValue | undefined;

    // QStash delivers at-least-once. Re-indexing an already-indexed document would upsert a second
    // set of vectors under fresh ids, leaving the first set orphaned and doubling every future
    // retrieval hit for this document, so a redelivery stops here.
    if (doc.isIndexed) {
      return NextResponse.json({ ok: true, skipped: "already indexed" });
    }

    // A retry that follows a partial upsert would otherwise leave the earlier vectors behind under
    // ids this run will not reuse. Clearing by docId first makes the operation idempotent.
    await deleteDocumentVectors(job.tenantId, job.businessId, job.docId);

    const { chunkCount, vectorIds } = await ingestDocument({
      tenantId: job.tenantId,
      businessId: job.businessId,
      docId: job.docId,
      // The text was extracted on the request path and stored on the row, so no re-parse and no
      // second call to the document-parsing service happens here.
      type: "TEXT",
      text: doc.content ?? "",
      filename: doc.name,
    });

    if (chunkCount === 0) {
      // Nothing readable came out of the file. Recorded as a terminal failure rather than left at
      // isIndexed:false, which the UI would render as a spinner that never stops.
      await prisma.knowledgeDoc.update({
        where: { id: job.docId },
        data: {
          chunkCount: 0,
          isIndexed: false,
          metadata: mergeMetadata(existingMetadata, { status: "FAILED", error: "No readable text found in this document." }),
        },
      });
      return NextResponse.json({ ok: true, indexed: false });
    }

    await prisma.knowledgeDoc.update({
      where: { id: job.docId },
      data: { chunkCount, vectorIds, isIndexed: true, metadata: mergeMetadata(doc.metadata, { status: "INDEXED" }) },
    });

    return NextResponse.json({ ok: true, chunkCount });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Indexing failed";
    console.error(`[WORKER KB] Failed to index ${job.docId}:`, error);

    // Recorded before answering so the document shows why it failed even if QStash gives up. The
    // write is contained: if it fails too, the retry below is still the right answer.
    try {
      await prisma.knowledgeDoc.update({
        where: { id: job.docId },
        data: { isIndexed: false, metadata: mergeMetadata(doc?.metadata, { status: "FAILED", error: reason }) },
      });
    } catch (writeError) {
      console.error(`[WORKER KB] Could not record failure for ${job.docId}:`, writeError);
    }

    // Non-2xx asks QStash to retry. Safe: the isIndexed guard and the delete-then-upsert above
    // mean a redelivery cannot duplicate vectors.
    return NextResponse.json({ error: reason }, { status: 500 });
  }
}
