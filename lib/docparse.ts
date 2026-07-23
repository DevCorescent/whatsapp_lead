/**
 * Document parsing via LlamaParse (LlamaCloud).
 *
 * Converts PDFs, DOCX, and images into clean Markdown — tables become Markdown
 * tables and images / scanned pages are OCR'd — which is far better for RAG than
 * raw text extraction (which flattens tables and drops images entirely).
 *
 * Enabled only when LLAMA_CLOUD_API_KEY is set; callers fall back to local
 * extraction (unpdf / mammoth) when it isn't. Uses plain `fetch` (no SDK) so it
 * stays Node-version safe — same reason lib/qdrant.ts uses REST directly.
 *
 * Get a free key at https://cloud.llamaindex.ai (free tier ~1000 pages/day).
 */

const DEFAULT_BASE = "https://api.cloud.llamaindex.ai/api/parsing";

/** True when document parsing is configured. */
export function isDocParseEnabled(): boolean {
  return Boolean(process.env.LLAMA_CLOUD_API_KEY);
}

function baseUrl(): string {
  return (process.env.LLAMA_CLOUD_BASE_URL ?? DEFAULT_BASE).replace(/\/+$/, "");
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.LLAMA_CLOUD_API_KEY ?? ""}` };
}

/**
 * Upload a file to LlamaParse, wait for parsing, and return the Markdown result.
 * Throws if the key is missing, the job errors, or it times out — the caller is
 * responsible for falling back to local extraction.
 */
export async function parseDocumentToMarkdown(
  buffer: Buffer,
  filename: string,
  opts: { pollIntervalMs?: number; timeoutMs?: number } = {},
): Promise<string> {
  if (!process.env.LLAMA_CLOUD_API_KEY) throw new Error("LLAMA_CLOUD_API_KEY is not set");

  const pollInterval = opts.pollIntervalMs ?? 2000;
  const timeout = opts.timeoutMs ?? 120_000;

  // 1) Upload the file (multipart — let fetch set the boundary; don't set Content-Type)
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)]), filename);

  const uploadRes = await fetch(`${baseUrl()}/upload`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  if (!uploadRes.ok) {
    throw new Error(`LlamaParse upload failed (${uploadRes.status}): ${await uploadRes.text()}`);
  }
  const uploadJson = (await uploadRes.json()) as { id?: string };
  const jobId = uploadJson.id;
  if (!jobId) throw new Error("LlamaParse upload returned no job id");

  // 2) Poll until the job finishes
  const deadline = Date.now() + timeout;
  for (;;) {
    const statusRes = await fetch(`${baseUrl()}/job/${jobId}`, { headers: authHeaders() });
    if (!statusRes.ok) throw new Error(`LlamaParse status check failed (${statusRes.status})`);
    const { status } = (await statusRes.json()) as { status?: string };

    if (status === "SUCCESS") break;
    if (status === "ERROR" || status === "FAILED" || status === "CANCELED") {
      throw new Error(`LlamaParse job ${jobId} ended with status ${status}`);
    }
    if (Date.now() > deadline) throw new Error(`LlamaParse job ${jobId} timed out after ${timeout}ms`);
    await new Promise((r) => setTimeout(r, pollInterval));
  }

  // 3) Fetch the Markdown result
  const resultRes = await fetch(`${baseUrl()}/job/${jobId}/result/markdown`, { headers: authHeaders() });
  if (!resultRes.ok) throw new Error(`LlamaParse result fetch failed (${resultRes.status})`);
  const result = (await resultRes.json()) as { markdown?: string };
  return result.markdown ?? "";
}
