// App-path RAG test — uses the project's REAL code (lib/rag.ts → @qdrant/js-client-rest).
// This is the exact pipeline the /api/knowledge and /api/ai/reply routes run.
// Run under Node LTS with: npx tsx scripts/test-rag-app.ts

import "dotenv/config";
import { randomUUID } from "crypto";
import { ingestDocument, retrieveContext, deleteDocumentVectors } from "../lib/rag";

const TENANT_ID = `test-tenant-${randomUUID()}`;
const DOC_ID = randomUUID();

const SAMPLE_DOC = `
WhatsCRM Refund Policy.
Customers can request a full refund within 14 days of purchase, no questions asked.
Refunds are processed back to the original payment method within 5 to 7 business days.
Our customer support team is available Monday to Friday, from 9 AM to 6 PM IST.
Standard shipping takes 3 to 5 business days across India, and express shipping delivers in 1 to 2 days for an extra 150 rupees.
`;

async function main() {
  console.log("🧪 RAG app-path test (real Qdrant client)\n");
  console.log(`   Node: ${process.version}`);
  console.log(`   tenantId: ${TENANT_ID}\n`);

  console.log("→ ingestDocument()...");
  const res = await ingestDocument({ tenantId: TENANT_ID, docId: DOC_ID, type: "TEXT", text: SAMPLE_DOC });
  console.log(`  ✅ ${res.chunkCount} chunk(s), ${res.vectorIds.length} vector(s)\n`);

  for (const q of [
    "How many days do I have to ask for a refund?",
    "What are your support hours?",
  ]) {
    console.log(`? "${q}"`);
    const ctx = await retrieveContext(TENANT_ID, q, { limit: 2, scoreThreshold: 0.3 });
    console.log(ctx ? `  → ${ctx.replace(/\n+/g, " ").slice(0, 140)}...\n` : "  → (no context)\n");
  }

  console.log("→ deleteDocumentVectors()...");
  await deleteDocumentVectors(TENANT_ID, DOC_ID);
  console.log("  ✅ Cleaned up.");
}

main().catch((e) => {
  console.error("\n❌ App-path RAG test failed:", e);
  process.exit(1);
});
