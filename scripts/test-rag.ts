// Standalone RAG smoke test — run with: npm run test:rag
//
// Exercises the full pipeline (chunk → Jina embed → Qdrant upsert → search) against
// a throwaway tenant, then deletes everything it created. Does NOT touch Postgres.
//
// Note: this talks to Qdrant over its REST API with plain fetch instead of the
// @qdrant/js-client-rest client, because that client's bundled undici is currently
// incompatible with Node 26 (throws "invalid onError method"). The embedding and
// chunking logic below is the project's real code from lib/embeddings + lib/rag.

import "dotenv/config";
import { randomUUID } from "crypto";
import { embedPassages, embedQuery } from "../lib/embeddings";
import { chunkText } from "../lib/rag";

const KB_COLLECTION = "knowledge_base";
const VECTOR_SIZE = 1024;

const TENANT_ID = `test-tenant-${randomUUID()}`;
const DOC_ID = randomUUID();

// Long enough (>2k chars) that chunkText() splits it into separate topic chunks,
// which is how retrieval is meant to work in practice.
const SAMPLE_DOC = `
WhatsCRM Refund Policy.
Customers can request a full refund within 14 days of purchase, no questions asked.
To start a refund, reply to your order confirmation message or contact our support team with your order number.
Refunds are processed back to the original payment method within 5 to 7 business days after approval.
Partial refunds are available for opened or used items at the discretion of the support team.
We do not charge any restocking fee for unopened items returned within the refund window.
If your refund is delayed beyond 7 business days, please reach out and we will escalate it immediately.

Business Hours and Support.
Our customer support team is available Monday to Friday, from 9 AM to 6 PM IST.
On Saturdays we offer limited support from 10 AM to 2 PM IST for urgent issues only.
We are closed on Sundays and all national public holidays.
You can reach support over WhatsApp, email, or phone, and we typically respond within a few hours during business hours.
Outside business hours, our chatbot can still answer common questions automatically.

Shipping and Delivery.
Standard shipping takes 3 to 5 business days across most locations in India.
Express shipping is available for an extra 150 rupees and delivers within 1 to 2 business days.
We ship to all major cities and most rural pin codes through our courier partners.
Once your order ships, you will receive a tracking link over WhatsApp so you can follow the delivery in real time.
Cash on delivery is available for orders under 5000 rupees in select regions.
`;

const QUERIES = [
  "How many days do I have to ask for a refund?",
  "What are your customer support timings?",
  "How much does express delivery cost?",
  "Do you sell laptops?", // intentionally irrelevant — should return nothing
];

// ─── Minimal Qdrant REST helpers (plain fetch) ───────────────────────────────

function qdrantFetch(path: string, init: RequestInit = {}) {
  const base = process.env.QDRANT_URL!;
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "api-key": process.env.QDRANT_API_KEY ?? "",
      ...(init.headers ?? {}),
    },
  });
}

async function ensureCollection() {
  const res = await qdrantFetch(`/collections/${KB_COLLECTION}`);
  if (!res.ok) {
    await qdrantFetch(`/collections/${KB_COLLECTION}`, {
      method: "PUT",
      body: JSON.stringify({ vectors: { size: VECTOR_SIZE, distance: "Cosine" } }),
    });
  }
  // Qdrant Cloud requires a payload index to filter on a field. Mirror the app's
  // lib/qdrant.ts ensureCollection(). These calls are idempotent.
  for (const field of ["tenantId", "docId"]) {
    await qdrantFetch(`/collections/${KB_COLLECTION}/index?wait=true`, {
      method: "PUT",
      body: JSON.stringify({ field_name: field, field_schema: "keyword" }),
    });
  }
}

// ─── Test ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🧪 RAG smoke test\n");
  console.log(`   QDRANT_URL:   ${process.env.QDRANT_URL ? "set ✅" : "MISSING ❌"}`);
  console.log(`   JINA_API_KEY: ${process.env.JINA_API_KEY ? "set ✅" : "MISSING ❌"}`);
  console.log(`   tenantId:     ${TENANT_ID}\n`);

  // 1. Chunk + embed + upsert
  console.log("→ Chunking + embedding sample document...");
  const chunks = chunkText(SAMPLE_DOC);
  const vectors = await embedPassages(chunks);
  console.log(`  ✅ ${chunks.length} chunk(s) embedded (${vectors[0].length} dims each)\n`);

  console.log("→ Upserting to Qdrant...");
  await ensureCollection();
  const upsert = await qdrantFetch(`/collections/${KB_COLLECTION}/points?wait=true`, {
    method: "PUT",
    body: JSON.stringify({
      points: chunks.map((chunk, i) => ({
        id: randomUUID(),
        vector: vectors[i],
        payload: { tenantId: TENANT_ID, docId: DOC_ID, chunkIndex: i, text: chunk },
      })),
    }),
  });
  if (!upsert.ok) throw new Error(`Upsert failed (${upsert.status}): ${await upsert.text()}`);
  console.log("  ✅ Upserted");
  console.log(`    upsert response: ${JSON.stringify(await upsert.json())}`);

  // Diagnostics: how many points does the collection think it has for us?
  const countRes = await qdrantFetch(`/collections/${KB_COLLECTION}/points/count`, {
    method: "POST",
    body: JSON.stringify({
      exact: true,
      filter: { must: [{ key: "tenantId", match: { value: TENANT_ID } }] },
    }),
  });
  console.log(`    count (this tenant): ${JSON.stringify(await countRes.json())}`);

  // Diagnostics: unfiltered search with the first query — does the vector exist at all?
  const probeVec = await embedQuery(QUERIES[0]);
  const probe = await qdrantFetch(`/collections/${KB_COLLECTION}/points/search`, {
    method: "POST",
    body: JSON.stringify({ vector: probeVec, limit: 3, with_payload: false }),
  });
  const probeJson = await probe.json();
  console.log(`    unfiltered search top scores: ${JSON.stringify((probeJson.result ?? []).map((r: { score: number }) => r.score))}\n`);

  // 2. Search
  let passed = 0;
  for (const query of QUERIES) {
    const vector = await embedQuery(query);
    const res = await qdrantFetch(`/collections/${KB_COLLECTION}/points/search`, {
      method: "POST",
      body: JSON.stringify({
        vector,
        limit: 2,
        // No score_threshold here — we want to see the raw top score for diagnostics.
        filter: { must: [{ key: "tenantId", match: { value: TENANT_ID } }] },
        with_payload: true,
      }),
    });
    const json = await res.json();
    const hits: { score: number; payload: { text: string } }[] = json.result ?? [];
    const isIrrelevant = query.includes("laptops");
    const APP_THRESHOLD = 0.4; // the value lib/rag.ts uses
    const top = hits[0];
    const gotHit = top ? top.score >= APP_THRESHOLD : false;

    console.log(`? "${query}"`);
    if (top) {
      const flag = top.score >= APP_THRESHOLD ? "✅ above" : "⚠️  below";
      console.log(`  → top score ${top.score.toFixed(3)} (${flag} ${APP_THRESHOLD} threshold)`);
      console.log(`    ${top.payload.text.replace(/\n+/g, " ").trim().slice(0, 120)}...`);
    } else {
      console.log("  → no vectors returned at all");
    }
    if (gotHit !== isIrrelevant) passed++;
    console.log("");
  }

  console.log(`Result: ${passed}/${QUERIES.length} queries behaved as expected.`);

  // 3. Cleanup
  console.log("\n→ Cleaning up test vectors...");
  await qdrantFetch(`/collections/${KB_COLLECTION}/points/delete?wait=true`, {
    method: "POST",
    body: JSON.stringify({
      filter: { must: [{ key: "tenantId", match: { value: TENANT_ID } }] },
    }),
  });
  console.log("  ✅ Done.");
}

main().catch((err) => {
  console.error("\n❌ RAG test failed:", err);
  process.exit(1);
});
