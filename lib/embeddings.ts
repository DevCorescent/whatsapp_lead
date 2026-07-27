/**
 * Jina embeddings (jina-embeddings-v3, 1024-dim).
 *
 * Jina v3 is task-aware: index document chunks with task "retrieval.passage"
 * and embed the user's search query with "retrieval.query". Using the matching
 * task on each side measurably improves retrieval quality.
 */
const JINA_URL = "https://api.jina.ai/v1/embeddings";
const JINA_MODEL = "jina-embeddings-v3";

type JinaTask = "retrieval.passage" | "retrieval.query";

/**
 * How many chunks go up in one request, and how many requests run at once.
 *
 * A document is embedded in a single call today, so a large one sends hundreds of chunks in one
 * request — slow, and close to the payload and token ceilings the API enforces per call. Splitting
 * into fixed batches keeps each request small and predictable; running a few concurrently is what
 * actually removes the wall-clock cost, since the time is spent waiting on the network rather than
 * on our CPU. Concurrency is deliberately low: Jina rate-limits per key, and a burst from one
 * upload would throttle every other tenant's.
 */
const BATCH_SIZE = 64;

/**
 * One request at a time, deliberately.
 *
 * The account's concurrency ceiling is low — sending three batches at once is answered with
 * `429 RATE_CONCURRENCY_LIMIT_EXCEEDED` — and this key is shared with `retrieveContext`, which
 * runs on the customer-reply path. Indexing now happens in a background worker, so its wall-clock
 * no longer affects how fast an upload feels; spending that budget on reliability rather than
 * speed is the right trade, and it keeps a bulk upload from throttling live replies.
 */
const BATCH_CONCURRENCY = 1;

/** Attempts per batch when the API throttles or fails transiently, and the backoff between them. */
const MAX_ATTEMPTS = 4;
const RETRY_BASE_MS = 500;

async function embedBatch(input: string[], task: JinaTask, apiKey: string): Promise<number[][]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await embedOnce(input, task, apiKey);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      // Only throttling and upstream faults are worth retrying. A 400 — an oversized input, a bad
      // model name — will fail identically every time, so retrying it just delays the report.
      if (!/\((429|500|502|503|504)\)/.test(lastError.message)) throw lastError;
      if (attempt === MAX_ATTEMPTS - 1) break;
      await new Promise((r) => setTimeout(r, RETRY_BASE_MS * 2 ** attempt));
    }
  }

  throw lastError ?? new Error("Jina embeddings failed");
}

async function embedOnce(input: string[], task: JinaTask, apiKey: string): Promise<number[][]> {
  const res = await fetch(JINA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: JINA_MODEL,
      task,
      // v3 supports Matryoshka dims; 1024 is the default full size.
      dimensions: 1024,
      input,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Jina embeddings failed (${res.status}): ${detail}`);
  }

  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data.map((d) => d.embedding);
}

/**
 * Embed any number of texts, in batches, preserving input order.
 *
 * Order matters: the caller pairs `vectors[i]` with `chunks[i]` when it builds Qdrant points, so a
 * reordered result would attach every chunk's text to another chunk's vector. Results are written
 * back by index rather than concatenated as batches complete, which is what makes the concurrency
 * safe.
 */
async function embed(input: string[], task: JinaTask): Promise<number[][]> {
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) throw new Error("JINA_API_KEY is not set");
  if (input.length === 0) return [];

  const batches: { start: number; texts: string[] }[] = [];
  for (let i = 0; i < input.length; i += BATCH_SIZE) {
    batches.push({ start: i, texts: input.slice(i, i + BATCH_SIZE) });
  }

  const out = new Array<number[]>(input.length);
  for (let i = 0; i < batches.length; i += BATCH_CONCURRENCY) {
    const wave = batches.slice(i, i + BATCH_CONCURRENCY);
    await Promise.all(
      wave.map(async ({ start, texts }) => {
        const vectors = await embedBatch(texts, task, apiKey);
        vectors.forEach((v, j) => {
          out[start + j] = v;
        });
      }),
    );
  }

  return out;
}

/** Embed document chunks for storage. */
export function embedPassages(texts: string[]): Promise<number[][]> {
  return embed(texts, "retrieval.passage");
}

/** Embed a single search query. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embed([text], "retrieval.query");
  return vector;
}
