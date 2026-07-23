import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";
import { ingestDocument, type DocType } from "@/lib/rag";

const createDocSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["TEXT", "URL"]),
  content: z.string().optional(),
  url: z.string().url().optional(),
}).refine((d) => d.content || d.url, { message: "Either content or url is required" });

const FILE_TYPES: Record<string, DocType> = {
  pdf: "PDF",
  docx: "DOCX",
  txt: "TXT",
  md: "TXT",
  // Images are OCR'd + table-extracted by the doc-parsing service (LlamaParse).
  png: "IMAGE",
  jpg: "IMAGE",
  jpeg: "IMAGE",
  webp: "IMAGE",
  tiff: "IMAGE",
  bmp: "IMAGE",
};
const MAX_FILE_MB = 10;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

export async function GET(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId } = scope;

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
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const { tenantId, businessId } = scope;

  const contentType = req.headers.get("content-type") ?? "";

  try {
    // ── File upload (PDF / DOCX / TXT) via multipart form ──────────────────
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const files = form.getAll("files").filter((f): f is File => f instanceof File);
      if (files.length === 0) return NextResponse.json({ success: false, error: "No files provided" }, { status: 400 });

      const created = [];
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) {
          return NextResponse.json({ success: false, error: `${file.name} exceeds the ${MAX_FILE_MB} MB limit` }, { status: 400 });
        }
        const ext = (file.name.split(".").pop() ?? "").toLowerCase();
        const type = FILE_TYPES[ext];
        if (!type) return NextResponse.json({ success: false, error: `Unsupported file type: .${ext}` }, { status: 400 });

        const buffer = Buffer.from(await file.arrayBuffer());
        created.push(await ingestAndPersist({ tenantId, businessId, name: file.name, type, buffer, size: file.size }));
      }
      return NextResponse.json({ success: true, data: created }, { status: 201 });
    }

    // ── Raw text or URL via JSON ──────────────────────────────────────────
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

    const parsed = createDocSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    const { name, type, content, url } = parsed.data;
    const doc = await ingestAndPersist({ tenantId, businessId, name, type, text: content, url });
    return NextResponse.json({ success: true, data: doc }, { status: 201 });
  } catch (error) {
    console.error("[KNOWLEDGE POST]", error);
    const message = error instanceof Error ? error.message : "Failed to create knowledge doc";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * Runs the RAG pipeline for one document, then persists the row with the
 * resulting vector IDs. The docId is generated up front so Qdrant payloads and
 * the DB row share the same identity; if ingestion throws, no orphan row is left.
 */
async function ingestAndPersist(params: {
  tenantId: string;
  businessId: string;
  name: string;
  type: DocType;
  buffer?: Buffer;
  text?: string;
  url?: string;
  size?: number;
}) {
  const { tenantId, businessId, name, type, buffer, text, url, size } = params;
  const docId = randomUUID();

  const { chunkCount, vectorIds } = await ingestDocument({ tenantId, docId, type, buffer, text, url, filename: name });

  return prisma.knowledgeDoc.create({
    data: {
      id: docId,
      tenantId,
      businessId,
      name,
      type,
      ...(text && { content: text }),
      ...(url && { url }),
      chunkCount,
      vectorIds,
      isIndexed: chunkCount > 0,
      ...(size != null && { metadata: { size } }),
    },
  });
}
