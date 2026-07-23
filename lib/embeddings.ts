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

async function embed(input: string[], task: JinaTask): Promise<number[][]> {
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) throw new Error("JINA_API_KEY is not set");
  if (input.length === 0) return [];

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

/** Embed document chunks for storage. */
export function embedPassages(texts: string[]): Promise<number[][]> {
  return embed(texts, "retrieval.passage");
}

/** Embed a single search query. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embed([text], "retrieval.query");
  return vector;
}
