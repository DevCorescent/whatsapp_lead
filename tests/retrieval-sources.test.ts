import test from "node:test";
import assert from "node:assert/strict";
import { groupChunksByDoc, type RetrievedChunk } from "../lib/rag";

const chunk = (docId: string, score: number, chunkIndex = 0): RetrievedChunk => ({
  docId,
  chunkIndex,
  score,
  text: `${docId}#${chunkIndex}`,
});

const names = new Map([
  ["doc_a", "policy.pdf"],
  ["doc_b", "prices.md"],
]);

test("a document is scored by its best chunk, not its average", () => {
  // Averaging would punish a long document for the passages that did not match,
  // which is most of them by construction.
  const sources = groupChunksByDoc([chunk("doc_a", 0.6), chunk("doc_a", 0.1, 1)], names);

  assert.equal(sources.length, 1);
  assert.equal(sources[0].score, 0.6);
  assert.equal(sources[0].chunks, 2);
});

test("documents come back strongest first", () => {
  const sources = groupChunksByDoc([chunk("doc_b", 0.31), chunk("doc_a", 0.52)], names);

  assert.deepEqual(sources.map((s) => s.name), ["policy.pdf", "prices.md"]);
});

test("many weak hits do not outrank one strong one", () => {
  // Summing scores would rank the document that matched weakly three times above
  // the one that actually answered the question.
  const sources = groupChunksByDoc(
    [chunk("doc_b", 0.2), chunk("doc_b", 0.2, 1), chunk("doc_b", 0.2, 2), chunk("doc_a", 0.5)],
    names,
  );

  assert.equal(sources[0].name, "policy.pdf");
  assert.equal(sources[1].chunks, 3);
});

test("a chunk whose document is not in the map is dropped", () => {
  // The map is built by a tenant-scoped query, so this filter is what stops
  // another workspace's filename reaching a citation — not merely a tidy-up for
  // documents deleted since indexing.
  const sources = groupChunksByDoc([chunk("doc_a", 0.5), chunk("doc_from_elsewhere", 0.9)], names);

  assert.deepEqual(sources.map((s) => s.name), ["policy.pdf"]);
});

test("no chunks means no citation, not an empty-named one", () => {
  assert.deepEqual(groupChunksByDoc([], names), []);
});
