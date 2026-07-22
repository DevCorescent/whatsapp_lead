import { NextRequest, NextResponse } from "next/server";
import { getBusinessScope } from "@/lib/business";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, businessId } = scope;

  try {
    const { id } = await params;
    const doc = await prisma.knowledgeDoc.findFirst({ where: { id, tenantId, businessId } });
    if (!doc) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: doc });
  } catch (error) {
    console.error("[KNOWLEDGE DOC GET]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch document" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, businessId } = scope;

  try {
    const { id } = await params;
    const doc = await prisma.knowledgeDoc.findFirst({ where: { id, tenantId, businessId } });
    if (!doc) return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
    await prisma.knowledgeDoc.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[KNOWLEDGE DOC DELETE]", error);
    return NextResponse.json({ success: false, error: "Failed to delete document" }, { status: 500 });
  }
}
