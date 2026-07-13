// ============================================================================
// OWNER  : Gauransh
// MODULE : Support
// ROUTE  : /api/knowledge
//
// METHODS
// GET    - List the authenticated tenant's knowledge documents, newest first
// POST   - Register a knowledge document
//
// ACCESS
// GET    - Authenticated. Scoped to session.user.tenantId.
// POST   - Authenticated. Same scoping.
// ============================================================================
//
// This route registers documents. It does not index them.
//
// Stated plainly because it changes what the endpoint is for: `KnowledgeDoc.isIndexed` defaults to
// false, `chunkCount` to 0 and `vectorIds` to an empty array, and nothing here advances any of them.
// Indexing means chunking the text, generating embeddings, and upserting the vectors into a store —
// and this project has no embeddings provider and no vector database. `lib/ai.ts` is backed by Groq,
// which serves no embeddings endpoint, and no vector client is installed. A document saved here is
// therefore catalogued, not retrievable: the RAG lookup in the webhook's auto-reply path has nothing
// to query. Wiring that up is a dependency decision, not something this route can fake.
//
// PERFORMANCE NOTE: `KnowledgeDoc` declares no `@@index([tenantId])` — it is the only tenant-scoped
// model in this module without one — so the list below filters rather than seeks. Harmless at the
// scale a knowledge base runs at, and worth knowing before it is not.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Columns the document list renders.
 *
 * `content` is deliberately excluded. It holds the full extracted text of a document — potentially
 * megabytes per row — and shipping it for every entry in a list that draws a filename and a status
 * would be the single most expensive thing this endpoint could do. `isIndexed` and `chunkCount` are
 * included because together they are the only honest answer to "is this document actually usable?".
 */
const KNOWLEDGE_LIST_SELECT = {
  id: true,
  name: true,
  type: true,
  url: true,
  chunkCount: true,
  isIndexed: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.KnowledgeDocSelect;

/**
 * The body of a document being registered.
 *
 * `strictObject` because the writable surface must be enforced rather than documented. `isIndexed`,
 * `chunkCount` and `vectorIds` are absent by design: they describe the state of an indexing pipeline,
 * and a client able to set `isIndexed: true` would mark a document retrievable that no vector store
 * has ever seen — the RAG lookup would then find nothing and the model would answer from silence,
 * confidently.
 */
const createKnowledgeSchema = z.strictObject({
  name: z.string().trim().min(1, "Document name is required"),
  type: z.string().trim().min(1, "Document type is required"),
  url: z.string().url("Must be a valid URL").optional(),
  content: z.string().trim().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

type CreateKnowledgeInput = z.infer<typeof createKnowledgeSchema>;

/**
 * List the tenant's knowledge documents, newest first.
 *
 * `tenantId` is the only predicate, and it comes from the session — there is no input a caller could
 * supply to widen it. See the module header on the missing index: this read filters the table rather
 * than seeking into it.
 */
async function listKnowledgeDocs(tenantId: string) {
  return prisma.knowledgeDoc.findMany({
    where: { tenantId },
    select: KNOWLEDGE_LIST_SELECT,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Register a document.
 *
 * A single create, so no transaction: one statement is already atomic, and wrapping it would pin a
 * connection to express a guarantee Postgres gives for free.
 *
 * `isIndexed`, `chunkCount` and `vectorIds` are left to the schema's defaults — false, 0 and empty.
 * That is the truthful state of a document nothing has embedded, and writing anything else here would
 * be the route lying about work it did not do.
 */
async function createKnowledgeDoc(
  tenantId: string,
  input: CreateKnowledgeInput
) {
  return prisma.knowledgeDoc.create({
    data: {
      tenantId,
      name: input.name,
      type: input.type,
      url: input.url,
      content: input.content,
      // `metadata` is a Json column; the validated object is a plain record and is handed to Prisma as
      // one. The cast reconciles Zod's `unknown` values with Prisma's Json input type — it widens
      // nothing and admits no `any`.
      metadata: input.metadata as Prisma.InputJsonObject | undefined,
    },
    select: KNOWLEDGE_LIST_SELECT,
  });
}

/**
 * Return the tenant's knowledge documents.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { tenantId } = session.user;

  try {
    const documents = await listKnowledgeDocs(tenantId);

    return NextResponse.json({ success: true, data: documents });
  } catch (error) {
    // Prisma's errors name columns and query shapes; the caller learns only that the read failed.
    console.error("[KNOWLEDGE]", error);

    return NextResponse.json(
      { success: false, error: "Failed to load knowledge documents" },
      { status: 500 }
    );
  }
}

/**
 * Register a knowledge document.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { tenantId } = session.user;

  try {
    const parsed = createKnowledgeSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const document = await createKnowledgeDoc(tenantId, parsed.data);

    return NextResponse.json(
      { success: true, data: document },
      { status: 201 }
    );
  } catch (error) {
    console.error("[KNOWLEDGE]", error);

    return NextResponse.json(
      { success: false, error: "Failed to create knowledge document" },
      { status: 500 }
    );
  }
}
