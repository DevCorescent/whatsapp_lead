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
import { mergeFaqMetadata } from "@/lib/knowledgeFaq";
import { generateDocFaqs } from "@/lib/knowledgeFaq.server";
import { hasCapacity, incrementAiUsage, planAllows } from "@/lib/billing/usage";
import type { KnowledgeIngestJob } from "@/lib/queue";

function mergeMetadata(metadata: unknown, extra: Record<string, unknown>): Prisma.InputJsonValue {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return extra as Prisma.InputJsonValue;
  }

  return { ...(metadata as Record<string, unknown>), ...extra } as Prisma.InputJsonValue;
}

/**
 * Generate and store one document's FAQs, swallowing every failure.
 *
 * Re-reads `metadata` instead of taking the copy the caller already has: the row was updated to
 * INDEXED a moment ago, and merging into the stale object would write that status back out.
 *
 * Gated and metered exactly as the manual route is. Without the gate, a plan that includes the
 * knowledge base but not AI would get model calls it is not entitled to; without the meter, the
 * same work would be billed when a user pressed the button and free when the worker did it on
 * upload — so importing fifty documents would spend fifty uncounted completions.
 */
async function writeFaqs(docId: string, tenantId: string, name: string, content: string) {
  try {
    if (!(await planAllows(tenantId, "aiEnabled"))) return;
    if (!(await hasCapacity(tenantId, "ai"))) {
      console.log(`[WORKER KB] Skipping FAQs for ${docId} — AI credits exhausted`);
      return;
    }

    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { aiModel: true },
    });
    const { faqs, truncated } = await generateDocFaqs({ name, content, model: settings?.aiModel });
    await incrementAiUsage(tenantId);

    const fresh = await prisma.knowledgeDoc.findUnique({
      where: { id: docId },
      select: { metadata: true },
    });
    await prisma.knowledgeDoc.update({
      where: { id: docId },
      data: { metadata: mergeFaqMetadata(fresh?.metadata, { faqs, truncated }) },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "FAQ generation failed";
    console.error(`[WORKER KB] FAQ generation failed for ${docId}:`, error);
    try {
      const fresh = await prisma.knowledgeDoc.findUnique({
        where: { id: docId },
        select: { metadata: true },
      });
      await prisma.knowledgeDoc.update({
        where: { id: docId },
        data: { metadata: mergeFaqMetadata(fresh?.metadata, { error: reason }) },
      });
    } catch {
      // The document is indexed; not being able to record why its FAQs are missing changes nothing.
    }
  }
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

    // Draft this document's FAQs while its text is already in hand, so the card shows what the
    // document can answer as soon as it turns green rather than waiting for someone to press a
    // button. Deliberately after the INDEXED write and inside its own try: the document is
    // indexed and usable whether or not the FAQ call succeeds, and a model outage must not make
    // this a non-2xx that sends QStash round again to re-embed a document that is already done.
    await writeFaqs(job.docId, job.tenantId, doc.name, doc.content ?? "");

    return NextResponse.json({ ok: true, chunkCount });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Indexing failed";
    console.error(`[WORKER KB] Failed to index ${job.docId}:`, error);

    // Recorded before answering so the document shows why it failed even if QStash gives up. The
    // write is contained: if it fails too, the retry below is still the right answer.
    try {
      await prisma.knowledgeDoc.update({
        where: { id: job.docId },
        data: { isIndexed: false, metadata: mergeMetadata(existingMetadata, { status: "FAILED", error: reason }) },
      });
    } catch (writeError) {
      console.error(`[WORKER KB] Could not record failure for ${job.docId}:`, writeError);
    }

    // Non-2xx asks QStash to retry. Safe: the isIndexed guard and the delete-then-upsert above
    // mean a redelivery cannot duplicate vectors.
    return NextResponse.json({ error: reason }, { status: 500 });
  }
}
