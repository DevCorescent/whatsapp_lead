import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";
import { deleteDocumentVectors } from "@/lib/rag";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  try {
    const scope = await getBusinessScope();
    if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const doc = await prisma.knowledgeDoc.findFirst({ where: { id, tenantId, businessId: scope.businessId } });
    if (!doc) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: doc });
  } catch (error) {
    console.error("[KNOWLEDGE DOC GET]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch document" }, { status: 500 });
  }
}

/**
 * Rename a knowledge document.
 *
 * The name is the one part of a document that is ours rather than the file's:
 * it is what the library list and the FAQ picker show. Content, chunks, vector
 * ids and the indexed flag are all products of the ingest pipeline
 * (app/api/workers/knowledge-ingest) and are never editable by hand — changing
 * `content` here would leave the Qdrant vectors describing text that no longer
 * exists, so replacing a document means re-uploading it.
 *
 * Renaming touches no embedding: retrieval matches on chunk text, not on the
 * document's label, so nothing needs re-indexing.
 */
const renameDocSchema = z
  .object({ name: z.string().trim().min(1, "Give the document a name").max(200) })
  .strict();

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = renameDocSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
  }

  try {
    const { id } = await params;
    // Ownership lives in this where clause: tenant and business both come from the
    // session, never from the request body.
    const doc = await prisma.knowledgeDoc.findFirst({
      where: { id, tenantId, businessId: scope.businessId },
      select: { id: true, name: true },
    });
    if (!doc) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });

    const updated = await prisma.knowledgeDoc.update({
      where: { id: doc.id },
      data: { name: parsed.data.name },
    });

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: scope.userId,
        action: "KNOWLEDGE_DOC_RENAMED",
        resource: "knowledge_doc",
        resourceId: doc.id,
        metadata: { from: doc.name, to: updated.name },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[KNOWLEDGE DOC PATCH]", error);
    return NextResponse.json({ success: false, error: "Failed to rename document" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const doc = await prisma.knowledgeDoc.findFirst({ where: { id, tenantId, businessId: scope.businessId } });
    if (!doc) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
    await deleteDocumentVectors(tenantId, scope.businessId, id);
    await prisma.knowledgeDoc.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[KNOWLEDGE DOC DELETE]", error);
    return NextResponse.json({ success: false, error: "Failed to delete document" }, { status: 500 });
  }
}
