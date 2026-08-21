// ============================================================================
// MODULE : FAQ set loading & presentation (server)
// ============================================================================
//
// Four routes need the same two things — "load this set and prove the caller
// owns it" and "shape it for the client with its documents resolved" — so both
// live here rather than being copied into each and drifting.

import { prisma } from "@/lib/prisma";
import type { KnowledgeFaqSet } from "@prisma/client";
import { readFaqList, readFaqStyle } from "@/lib/knowledgeFaq";

export interface FaqSetDoc {
  id: string;
  name: string;
  isIndexed: boolean;
}

/**
 * Shape a set for the client, resolving its document ids to names.
 *
 * `docIds` is a plain array with no foreign key, so an id can outlive the
 * document it names. Rather than hide that, the number of ids that no longer
 * resolve is returned: a set quietly answering from two documents when it was
 * built from three is exactly the failure worth being told about.
 */
export function presentFaqSet(set: KnowledgeFaqSet, docs: Map<string, FaqSetDoc>) {
  const documents = set.docIds
    .map((id) => docs.get(id))
    .filter((d): d is FaqSetDoc => Boolean(d));

  return {
    id: set.id,
    name: set.name,
    docIds: set.docIds,
    documents,
    missingDocs: set.docIds.length - documents.length,
    faqs: readFaqList(set.faqs),
    style: readFaqStyle(set.style),
    truncated: set.truncated,
    error: set.error,
    createdAt: set.createdAt,
    updatedAt: set.updatedAt,
  };
}

/** Look up the documents named by a set, scoped to the caller's business. */
export async function faqSetDocs(
  tenantId: string,
  businessId: string,
  docIds: string[],
): Promise<FaqSetDoc[]> {
  if (docIds.length === 0) return [];
  return prisma.knowledgeDoc.findMany({
    where: { id: { in: docIds }, tenantId, businessId },
    select: { id: true, name: true, isIndexed: true },
  });
}

/**
 * Load one set with its documents, or null when it is not the caller's.
 *
 * Scoped on tenantId AND businessId, like every other knowledge read: a set
 * belongs to one business's knowledge base, and an id from another workspace
 * must look identical to an id that does not exist.
 */
export async function loadFaqSet(tenantId: string, businessId: string, id: string) {
  const set = await prisma.knowledgeFaqSet.findFirst({ where: { id, tenantId, businessId } });
  if (!set) return null;

  const docs = await faqSetDocs(tenantId, businessId, set.docIds);
  return { set, docs, view: presentFaqSet(set, new Map(docs.map((d) => [d.id, d]))) };
}
