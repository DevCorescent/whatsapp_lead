import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createDocSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["TEXT", "URL", "PDF", "DOCX"]),
  content: z.string().optional(),
  url: z.string().url().optional(),
}).refine((d) => d.content || d.url, { message: "Either content or url is required" });

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  try {
    const docs = await prisma.knowledgeDoc.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        type: true,
        url: true,
        chunkCount: true,
        isIndexed: true,
        createdAt: true,
        updatedAt: true,
        metadata: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, data: docs });
  } catch (error) {
    console.error("[KNOWLEDGE GET]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch knowledge docs" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session.user;

  try {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

    const parsed = createDocSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    const { name, type, content, url } = parsed.data;

    // Simple chunking: split content into ~500-char chunks
    const chunks = content
      ? content.match(/.{1,500}/g) ?? []
      : [];

    const doc = await prisma.knowledgeDoc.create({
      data: {
        tenantId,
        name,
        type,
        ...(content && { content }),
        ...(url && { url }),
        chunkCount: chunks.length,
        isIndexed: chunks.length > 0, // Mark as indexed if we have content
        vectorIds: [], // Pinecone integration not configured — stored in content column
      },
    });

    return NextResponse.json({ success: true, data: doc }, { status: 201 });
  } catch (error) {
    console.error("[KNOWLEDGE POST]", error);
    return NextResponse.json({ success: false, error: "Failed to create knowledge doc" }, { status: 500 });
  }
}
