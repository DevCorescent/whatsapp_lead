"use client";

/**
 * Ask the knowledge base a question and see what comes back.
 *
 * This runs the same search an incoming customer message runs — same embedding,
 * same filter, same scoring — and shows the chunks instead of feeding them to a
 * model. It exists because there was previously no way to find out what the AI
 * retrieves short of having a customer ask: every "why did it answer that" and
 * every retrieval setting was a guess made against invisible data.
 *
 * The two controls are the point as much as the results are. Matches per answer
 * and the score cutoff are what decide whether a document gets used at all, and
 * they were constants nobody could see. Trying a real question at 0.3 and again
 * at 0 is what distinguishes "indexed but scoring badly" from "not indexed".
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, FlaskConical, Loader2, Search, SlidersHorizontal } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import { postJson } from "@/components/knowledge/api";

interface SearchHit {
  docId: string;
  docName: string;
  docType: string | null;
  chunkIndex: number;
  score: number;
  text: string;
}

interface SearchResult {
  query: string;
  limit: number;
  scoreThreshold: number;
  results: SearchHit[];
}

/** Mirrors the defaults in lib/rag.ts, which are what a real reply uses. */
const DEFAULT_LIMIT = 6;
const DEFAULT_THRESHOLD = 0.3;

/**
 * Colour by how strongly a chunk matched.
 *
 * Bands rather than a gradient, because the useful question is not "0.41 or
 * 0.44" but "would I trust an answer built on this". jina-embeddings-v3 cosine
 * scores run low — a strong match is around 0.5, not 0.9 — so the bands are set
 * against that scale and not against an intuition borrowed from percentages.
 */
function scoreTone(score: number): { label: string; className: string } {
  if (score >= 0.5) return { label: "strong", className: "bg-emerald-50 text-emerald-700" };
  if (score >= 0.35) return { label: "fair", className: "bg-amber-50 text-amber-800" };
  return { label: "weak", className: "bg-slate-100 text-slate-600" };
}

export function RetrievalTester() {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [showTuning, setShowTuning] = useState(false);

  const search = useMutation({
    mutationFn: async () => {
      const json = await postJson<SearchResult>("/api/knowledge/search", {
        query: query.trim(),
        limit,
        scoreThreshold: threshold,
      });
      return json.data as SearchResult;
    },
  });

  const result = search.data;
  const tuned = limit !== DEFAULT_LIMIT || threshold !== DEFAULT_THRESHOLD;

  return (
    <Card className="mt-8 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <FlaskConical className="h-4 w-4 text-emerald-600" />
            Test retrieval
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Ask what a customer would ask, and see the passages the AI would be given.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowTuning((v) => !v)}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
            showTuning || tuned
              ? "bg-slate-100 text-slate-800"
              : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Settings
          {tuned && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) search.mutate();
        }}
        className="mt-3 flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What is your refund policy?"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0B6E4F] focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
        </div>
        <Button type="submit" disabled={search.isPending || !query.trim()}>
          {search.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {search.isPending ? "Searching…" : "Search"}
        </Button>
      </form>

      {showTuning && (
        <div className="mt-3 grid gap-4 rounded-lg border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2">
          <label className="block">
            <span className="flex items-center justify-between text-xs font-medium text-slate-700">
              Passages retrieved
              <span className="font-mono text-slate-500">{limit}</span>
            </span>
            <input
              type="range"
              min={1}
              max={20}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="mt-1.5 w-full accent-[#0B6E4F]"
            />
            <span className="mt-1 block text-[11px] text-slate-500">
              How many chunks are handed to the model. Default {DEFAULT_LIMIT}.
            </span>
          </label>

          <label className="block">
            <span className="flex items-center justify-between text-xs font-medium text-slate-700">
              Score cutoff
              <span className="font-mono text-slate-500">{threshold.toFixed(2)}</span>
            </span>
            <input
              type="range"
              min={0}
              max={0.8}
              step={0.05}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="mt-1.5 w-full accent-[#0B6E4F]"
            />
            <span className="mt-1 block text-[11px] text-slate-500">
              Below this a passage is ignored. Default {DEFAULT_THRESHOLD}; drop it to 0 to see
              whether a document is indexed at all.
            </span>
          </label>
        </div>
      )}

      {search.isError && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{(search.error as Error).message}</span>
        </p>
      )}

      {result && !search.isPending && (
        <div className="mt-4">
          {result.results.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
              <p className="text-sm font-medium text-amber-900">Nothing matched.</p>
              <p className="mt-0.5 text-xs text-amber-800">
                {/* The distinction the cutoff control exists to draw. At 0 there
                    is no filtering left, so an empty result means the documents
                    genuinely do not contain anything on this topic. */}
                {result.scoreThreshold > 0
                  ? `No passage scored above ${result.scoreThreshold.toFixed(2)}. Lower the cutoff in Settings to see the closest misses.`
                  : "Even with no cutoff there is nothing close. The answer is not in any indexed document."}
              </p>
            </div>
          ) : (
            <>
              <p className="mb-2 text-xs text-slate-500">
                {result.results.length} passage{result.results.length === 1 ? "" : "s"} — this is
                exactly what the AI would be given for that question.
              </p>
              <ol className="space-y-2">
                {result.results.map((hit, i) => {
                  const tone = scoreTone(hit.score);
                  return (
                    <li
                      key={`${hit.docId}-${hit.chunkIndex}-${i}`}
                      className="rounded-lg border border-slate-200 bg-white p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-slate-50 text-slate-700">{hit.docName}</Badge>
                        <Badge className="bg-slate-50 text-slate-500">chunk {hit.chunkIndex}</Badge>
                        <span
                          className={cn(
                            "ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            tone.className,
                          )}
                        >
                          {hit.score.toFixed(3)} · {tone.label}
                        </span>
                      </div>
                      {/* The stored chunk verbatim, whitespace kept. A table that
                          survived parsing as Markdown and one that collapsed into
                          a line of numbers look identical once trimmed. */}
                      <pre className="scrollbar-slim mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-slate-600">
                        {hit.text}
                      </pre>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
