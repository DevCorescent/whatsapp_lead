import { QdrantClient } from "@qdrant/js-client-rest";

/**
 * Single Qdrant collection for the whole platform. Multi-tenancy is enforced by
 * a `tenantId` field stored in every point's payload and a mandatory filter on
 * every search/delete — NOT by a collection-per-tenant (which does not scale).
 */
export const KB_COLLECTION = "knowledge_base";

/** Must match the embedding model's output size. Jina v3 = 1024. */
export const VECTOR_SIZE = 1024;

let client: QdrantClient | null = null;

export function qdrant(): QdrantClient {
  if (!client) {
    const url = process.env.QDRANT_URL;
    if (!url) throw new Error("QDRANT_URL is not set");
    client = new QdrantClient({ url, apiKey: process.env.QDRANT_API_KEY });
  }
  return client;
}

/** Idempotently ensures the collection exists. Safe to call on every ingest. */
export async function ensureCollection(): Promise<void> {
  const c = qdrant();
  const { collections } = await c.getCollections();
  if (collections.some((col) => col.name === KB_COLLECTION)) return;

  await c.createCollection(KB_COLLECTION, {
    vectors: { size: VECTOR_SIZE, distance: "Cosine" },
  });
  // Indexing the tenant filter keeps per-tenant search fast as data grows.
  await c.createPayloadIndex(KB_COLLECTION, {
    field_name: "tenantId",
    field_schema: "keyword",
  });
  await c.createPayloadIndex(KB_COLLECTION, {
    field_name: "docId",
    field_schema: "keyword",
  });
}
