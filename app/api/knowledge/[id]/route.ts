// ============================================================================
// OWNER  : Gauransh
// MODULE : Support
// ROUTE  : /api/knowledge/[id]
//
// METHODS
// DELETE - Remove a knowledge document from the tenant's library
//
// ACCESS
// DELETE - Authenticated. Scoped to session.user.tenantId; a document owned by another
//          workspace answers 404, exactly as a non-existent one does.
// ============================================================================
//
// Only DELETE is exposed. GET is deliberately absent: the list at /api/knowledge already carries every
// column a client draws, and the one column it withholds — `content`, the full extracted text of the
// document — is withheld on purpose. Adding a detail route later is a decision, not an oversight.
//
// A hard delete, and correctly so. Unlike a Lead or a Ticket, a knowledge document is reference
// material, not a record of something that happened: it carries no history anyone will later need to
// produce, so there is nothing a soft delete would preserve.
//
// CAVEAT worth stating: `KnowledgeDoc.vectorIds` exists to hold the ids of this document's embeddings
// in a vector store, so that deleting the row can also delete the vectors. No vector store is wired
// into this project — see /api/knowledge — so `vectorIds` is always empty and there is nothing to
// clean up. The moment an indexing pipeline lands, this route acquires a second responsibility, and
// forgetting it would leave a deleted document still answering questions through the RAG lookup.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Resolve a document while enforcing tenant isolation.
 *
 * `findFirst`, never `findUnique`. `id` is a cuid and unique on its own, so `findUnique({ id })` would
 * happily return another workspace's document — uniqueness identifies a row, it does not authorise
 * access to it. Folding `tenantId` into the predicate makes a foreign document indistinguishable from
 * one that does not exist, which is the only answer that leaks nothing: a distinct 403 would confirm
 * the row is real and tell the caller they had found something worth looking for.
 *
 * This read is what makes the delete below safe to key on `id` alone. Deleting straight from the
 * request id — even with a tenant predicate on a `deleteMany` — would answer the same for "not yours"
 * and "not there", but it would also make the ownership check invisible to anyone reading the handler.
 * Proving ownership as its own step is what keeps the guarantee legible.
 *
 * Selects only the id: nothing about the document's contents bears on whether it may be deleted.
 */
async function resolveKnowledgeDoc(tenantId: string, documentId: string) {
  return prisma.knowledgeDoc.findFirst({
    where: { id: documentId, tenantId },
    select: { id: true },
  });
}

/**
 * Delete a document.
 *
 * A single delete, so no transaction: one statement is already atomic, and wrapping it would pin a
 * connection to express a guarantee Postgres gives for free.
 *
 * Keyed by `id` alone because ownership was proved by `resolveKnowledgeDoc` — re-deriving the tenant
 * here would issue the same read twice, and a document cannot change tenants between the two
 * statements.
 *
 * `KnowledgeDoc` owns no child rows, so there is no cascade to reason about. The only thing that
 * outlives this row is its embeddings, and none exist yet — see the module header.
 */
async function deleteKnowledgeDoc(documentId: string): Promise<void> {
  await prisma.knowledgeDoc.delete({ where: { id: documentId } });
}

/**
 * Remove a knowledge document.
 *
 * Idempotent from the caller's side: a repeated delete answers 404 rather than a server error, because
 * the ownership check cannot find a row that is already gone.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { tenantId } = session.user;

  try {
    const { id } = await params;

    const document = await resolveKnowledgeDoc(tenantId, id);
    if (!document) {
      return NextResponse.json(
        { success: false, error: "Knowledge document not found" },
        { status: 404 }
      );
    }

    await deleteKnowledgeDoc(document.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    // Prisma's errors name columns and query shapes; the caller learns only that the delete failed.
    console.error("[KNOWLEDGE]", error);

    return NextResponse.json(
      { success: false, error: "Failed to delete knowledge document" },
      { status: 500 }
    );
  }
}
