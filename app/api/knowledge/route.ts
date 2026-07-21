import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { detectDocType, extractText } from "@/lib/extract";
import { saveFile } from "@/lib/storage";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB

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

  // Branch: multipart file upload (TXT / PDF / DOCX)
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.startsWith("multipart/form-data")) {
    try {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
      }

      if (file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json({ success: false, error: "File too large — maximum size is 15MB" }, { status: 413 });
      }

      const type = detectDocType(file.name, file.type);
      if (!type) {
        return NextResponse.json({ success: false, error: "Unsupported file type — upload a PDF, DOCX or TXT" }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const content = await extractText(buffer, type);
      if (!content) {
        return NextResponse.json({ success: false, error: "Could not extract any text from this file" }, { status: 400 });
      }

      const { key } = await saveFile(tenantId, file.name, buffer);

      const nameField = form.get("name");
      const name = typeof nameField === "string" && nameField.trim() ? nameField.trim() : file.name;

      const chunkCount = content.match(/.{1,500}/g)?.length ?? 0;

      const doc = await prisma.knowledgeDoc.create({
        data: {
          tenantId,
          name,
          type,
          content,
          url: key,
          chunkCount,
          isIndexed: true,
          vectorIds: [],
          metadata: { originalName: file.name, mimeType: file.type, size: file.size },
        },
        select: {
          id: true,
          name: true,
          type: true,
          url: true,
          chunkCount: true,
          isIndexed: true,
          createdAt: true,
        },
      });

      return NextResponse.json({ success: true, data: doc }, { status: 201 });
    } catch (error) {
      console.error("[KNOWLEDGE UPLOAD]", error);
      return NextResponse.json({ success: false, error: "Failed to upload document" }, { status: 500 });
    }
  }

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
