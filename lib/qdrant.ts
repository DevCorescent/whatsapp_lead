/**
 * Minimal Qdrant REST client built on the platform's global `fetch`.
 *
 * Why not @qdrant/js-client-rest? That client attaches a custom `undici` Agent as
 * the fetch `dispatcher` on Node. On Node 22 that happened to work, but on Node 26
 * the built-in fetch rejects the foreign dispatcher with `UND_ERR_INVALID_ARG`
 * ("invalid onError method"), which broke every Qdrant call. Talking to the REST
 * API directly with plain `fetch` sidesteps the dispatcher entirely and works on
 * any Node version.
 *
 * Single Qdrant collection for the whole platform. Multi-tenancy is enforced by a
 * `tenantId` field stored in every point's payload and a mandatory filter on every
 * search/delete — NOT by a collection-per-tenant (which does not scale).
 */
export const KB_COLLECTION = "knowledge_base";

/** Must match the embedding model's output size. Jina v3 = 1024. */
export const VECTOR_SIZE = 1024;

export interface ScoredPoint {
  id: string | number;
  score: number;
  payload?: Record<string, unknown> | null;
}

interface QdrantRestClient {
  getCollections(): Promise<{ collections: { name: string }[] }>;
  createCollection(name: string, body: { vectors: { size: number; distance: string } }): Promise<void>;
  createPayloadIndex(name: string, body: { field_name: string; field_schema: string }): Promise<void>;
  upsert(name: string, body: { wait?: boolean; points: unknown[] }): Promise<void>;
  search(name: string, body: Record<string, unknown>): Promise<ScoredPoint[]>;
  delete(name: string, body: { wait?: boolean; filter: unknown }): Promise<void>;
}

let client: QdrantRestClient | null = null;

function makeClient(): QdrantRestClient {
  const url = process.env.QDRANT_URL;
  if (!url) throw new Error("QDRANT_URL is not set");
  const base = url.replace(/\/+$/, "");
  const apiKey = process.env.QDRANT_API_KEY;

  async function call<T>(path: string, method: string, body?: unknown): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "api-key": apiKey } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await res.text();
    let json: unknown = {};
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text };
      }
    }

    if (!res.ok) {
      const status = (json as { status?: unknown })?.status;
      const detail =
        typeof status === "object" && status !== null && "error" in status
          ? (status as { error?: string }).error
          : typeof status === "string"
            ? status
            : text || res.statusText;
      throw new Error(`Qdrant ${method} ${path} failed (${res.status}): ${detail}`);
    }

    return json as T;
  }

  const enc = encodeURIComponent;
  const waitQuery = (wait?: boolean) => (wait ? "?wait=true" : "");

  return {
    async getCollections() {
      const json = await call<{ result?: { collections?: { name: string }[] } }>("/collections", "GET");
      return { collections: json.result?.collections ?? [] };
    },
    async createCollection(name, body) {
      await call(`/collections/${enc(name)}`, "PUT", body);
    },
    async createPayloadIndex(name, body) {
      await call(`/collections/${enc(name)}/index?wait=true`, "PUT", body);
    },
    async upsert(name, body) {
      await call(`/collections/${enc(name)}/points${waitQuery(body.wait)}`, "PUT", { points: body.points });
    },
    async search(name, body) {
      const json = await call<{ result?: ScoredPoint[] }>(`/collections/${enc(name)}/points/search`, "POST", body);
      return json.result ?? [];
    },
    async delete(name, body) {
      await call(`/collections/${enc(name)}/points/delete${waitQuery(body.wait)}`, "POST", { filter: body.filter });
    },
  };
}

export function qdrant(): QdrantRestClient {
  if (!client) client = makeClient();
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
  // Indexing the tenant filter keeps per-tenant search fast as data grows, and
  // Qdrant Cloud *requires* an index to filter on a field at all.
  await c.createPayloadIndex(KB_COLLECTION, {
    field_name: "tenantId",
    field_schema: "keyword",
  });
  await c.createPayloadIndex(KB_COLLECTION, {
    field_name: "docId",
    field_schema: "keyword",
  });
}
