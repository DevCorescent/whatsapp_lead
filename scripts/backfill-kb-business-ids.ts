/**
 * Backfill `businessId` onto knowledge-base vectors written before business
 * scoping existed.
 *
 * WHY THIS IS NEEDED
 *
 * `retrieveContext` filters on tenantId AND businessId with a `must`, which is an
 * AND. Points indexed before that filter was added carry no businessId at all, so
 * they match none of it — retrieval returns nothing for them and the AI answers
 * ungrounded, while the knowledge base still reports the documents as indexed.
 * The symptom is silent: a workspace that looks trained and behaves as if it is
 * not.
 *
 * The fix is to give the old points the field rather than to relax the filter.
 * Relaxing it would let one business be answered from another's documents, which
 * is the leak the filter was added to close.
 *
 * Payload-only: no re-embedding, so this costs nothing but the round trips.
 * Idempotent — points that already carry the right businessId are written with
 * the same value and can be re-run safely.
 *
 * Usage:  npx tsx scripts/backfill-kb-business-ids.ts [--apply]
 * Without --apply it reports what it would change and writes nothing.
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { ensureCollection, KB_COLLECTION, qdrant } from "../lib/qdrant";

const APPLY = process.argv.includes("--apply");

async function countPoints(filter: unknown): Promise<number> {
  let total = 0;
  let offset: string | number | null = null;
  do {
    const page = await qdrant().scroll(KB_COLLECTION, {
      filter,
      limit: 256,
      with_payload: false,
      with_vector: false,
      ...(offset != null && { offset }),
    });
    total += page.points.length;
    offset = page.nextOffset;
  } while (offset != null);
  return total;
}

async function main() {
  if (!process.env.QDRANT_URL) throw new Error("QDRANT_URL is not set");
  await ensureCollection();

  const docs = await prisma.knowledgeDoc.findMany({
    select: { id: true, tenantId: true, businessId: true, name: true, chunkCount: true },
  });
  console.log(`${docs.length} document(s) in the database\n`);

  let repaired = 0;
  let alreadyOk = 0;

  for (const doc of docs) {
    // Points for this document that are missing the field. `is_empty` is how
    // Qdrant expresses "this key is absent", which is exactly the legacy state.
    const missingFilter = {
      must: [
        { key: "tenantId", match: { value: doc.tenantId } },
        { key: "docId", match: { value: doc.id } },
        { is_empty: { key: "businessId" } },
      ],
    };

    const missing = await countPoints(missingFilter);
    if (missing === 0) {
      alreadyOk += 1;
      console.log(`  ok       ${doc.name}`);
      continue;
    }

    console.log(`  ${APPLY ? "repair " : "would  "}  ${doc.name} — ${missing} point(s) missing businessId`);

    if (APPLY) {
      await qdrant().setPayload(KB_COLLECTION, {
        wait: true,
        payload: { businessId: doc.businessId },
        filter: missingFilter,
      });
      repaired += 1;
    }
  }

  console.log(
    `\n${alreadyOk} document(s) already scoped, ${repaired} repaired` +
      (APPLY ? "." : ". Re-run with --apply to write the changes."),
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("\nBackfill failed:", error);
  process.exit(1);
});
