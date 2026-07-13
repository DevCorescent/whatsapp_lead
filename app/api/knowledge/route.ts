// TODO [GAURANSH]: Knowledge base (RAG) document endpoints.
//
// GET /api/knowledge  → list all KnowledgeDocs for tenant
//
// POST /api/knowledge
//   - Body: FormData { file?, url?, content?, title }
//   - Supported types: PDF, DOCX, TXT, URL
//   - Steps:
//     1. Extract text content (pdf-parse, cheerio for URL)
//     2. Chunk into 500-token segments with 50-token overlap
//     3. Generate embeddings: openai.embeddings.create({ model: "text-embedding-3-small" })
//     4. Upsert vectors to Pinecone with metadata { tenantId, docId, chunkIndex }
//     5. Save KnowledgeDoc row with status: "READY"

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  // TODO [GAURANSH]: Implement
  return NextResponse.json({ success: false, error: "Not implemented yet" }, { status: 501 });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  // TODO [GAURANSH]: Implement - multipart file upload + embedding pipeline
  return NextResponse.json({ success: false, error: "Not implemented yet" }, { status: 501 });
}
