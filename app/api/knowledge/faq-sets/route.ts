// ============================================================================
// MODULE : Multi-document FAQ sets
// ROUTE  : /api/knowledge/faq-sets
//
// METHODS
// GET  - List the sets for the active business, with their documents resolved
// POST - Create a set over two or more documents (no model call yet)
//
// ACCESS : Signed-in members of the tenant, scoped to the active business.
// ============================================================================
//
// Creation does not generate anything. Naming the set and choosing its documents
// is a decision about scope; drafting the questions is a model call the user
// triggers next, from the editor, once they can see what they picked. Merging
// the two would bill a request for a set someone was still assembling.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";
import { guardFeature } from "@/lib/billing/guard";
import { presentFaqSet } from "@/lib/knowledgeFaqSet";
import { createFaqSetSchema } from "@/lib/validators/knowledgeFaq";

export async function GET() {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, businessId } = scope;

  try {
    const [sets, docs] = await Promise.all([
      prisma.knowledgeFaqSet.findMany({
        where: { tenantId, businessId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.knowledgeDoc.findMany({
        where: { tenantId, businessId },
        select: { id: true, name: true, isIndexed: true },
      }),
    ]);

    const byId = new Map(docs.map((d) => [d.id, d]));
    return NextResponse.json({ success: true, data: sets.map((s) => presentFaqSet(s, byId)) });
  } catch (error) {
    console.error("[FAQ SETS GET]", error);
    return NextResponse.json({ success: false, error: "Failed to load FAQ sets" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, businessId } = scope;

  // Gated on the knowledge base itself rather than on AI: a set is a saved list
  // of questions about documents, and a tier without RAG has no documents.
  const noRag = await guardFeature(tenantId, "ragEnabled");
  if (noRag) return noRag;

  try {
    const parsed = createFaqSetSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { name, docIds } = parsed.data;

    // Re-queried under the caller's scope rather than trusted from the body.
    // These ids arrive from a browser and decide which documents get read.
    const docs = await prisma.knowledgeDoc.findMany({
      where: { id: { in: docIds }, tenantId, businessId },
      select: { id: true, name: true, isIndexed: true },
    });
    if (docs.length !== new Set(docIds).size) {
      return NextResponse.json(
        { success: false, error: "One or more of those documents could not be found" },
        { status: 404 },
      );
    }
    const unindexed = docs.filter((d) => !d.isIndexed);
    if (unindexed.length > 0) {
      return NextResponse.json(
        { success: false, error: `Still indexing: ${unindexed.map((d) => d.name).join(", ")}` },
        { status: 409 },
      );
    }

    const set = await prisma.knowledgeFaqSet.create({
      data: { tenantId, businessId, name, docIds: docs.map((d) => d.id) },
    });

    return NextResponse.json(
      { success: true, data: presentFaqSet(set, new Map(docs.map((d) => [d.id, d]))) },
      { status: 201 },
    );
  } catch (error) {
    console.error("[FAQ SETS POST]", error);
    return NextResponse.json({ success: false, error: "Failed to create the FAQ set" }, { status: 500 });
  }
}
