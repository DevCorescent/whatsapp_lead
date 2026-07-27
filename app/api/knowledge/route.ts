import { createHash, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getBusinessScope } from "@/lib/business";
import { extractDocumentText, ingestDocument, type DocType } from "@/lib/rag";
import { publishKnowledgeIngest } from "@/lib/queue";

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
  const { tenantId, businessId } = scope;

  try {
    const docs = await prisma.knowledgeDoc.findMany({
      // Documents are persisted with the businessId they were uploaded under, so the list is
      // scoped the same way. Note the retrieval side (lib/rag.ts) still filters on tenantId
      // only — see the note in the audit; that is a separate, deliberate decision.
      where: { tenantId, businessId },
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

      const results: Array<{ success: boolean; doc?: unknown; error?: string; skipped?: boolean; duplicate?: boolean }> = [];
      for (const file of files) {
        try {
          if (file.size > MAX_FILE_BYTES) {
            results.push({ success: false, error: `${file.name} exceeds the ${MAX_FILE_MB} MB limit` });
            continue;
          }
          const ext = (file.name.split(".").pop() ?? "").toLowerCase();
          const type = FILE_TYPES[ext];
          if (!type) {
            results.push({ success: false, error: `Unsupported file type: .${ext}` });
            continue;
          }

          const buffer = Buffer.from(await file.arrayBuffer());
          const outcome = await storeAndQueue({ tenantId, businessId, name: file.name, type, buffer, size: file.size });
          results.push(outcome);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to process file";
          results.push({ success: false, error: `${file.name}: ${message}` });
        }
      }
      const uploadedDocs = results.filter((r): r is { success: true; doc: unknown } => r.success && !r.skipped && !r.duplicate).map((r) => r.doc);
      return NextResponse.json({ success: true, data: uploadedDocs, summary: { uploaded: uploadedDocs.length, failed: results.filter((r) => !r.success).length, skipped: results.filter((r) => r.skipped).length, duplicates: results.filter((r) => r.duplicate).length } }, { status: 201 });
    }

    // ── Raw text or URL via JSON ──────────────────────────────────────────
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

    const parsed = createDocSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    const { name, type, content, url } = parsed.data;
    const result = await storeAndQueue({ tenantId, businessId, name, type, text: content, url });
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error ?? "Failed to create knowledge doc" }, { status: 400 });
    }
    return NextResponse.json({ success: true, data: result.doc }, { status: 201 });
  } catch (error) {
    console.error("[KNOWLEDGE POST]", error);
    const message = error instanceof Error ? error.message : "Failed to create knowledge doc";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * Store one document and hand its indexing to the queue.
 *
 * Only the text extraction stays on the request path, because it is the one step that needs the
 * uploaded bytes — those do not survive the response on a serverless deployment, and a 10 MB file
 * would not fit in a QStash message either. Everything after it (chunking, embedding, the vector
 * upsert) is where the time actually went: roughly 66ms per chunk, so a 150-chunk document held
 * the request for ten seconds and a large one past the function's own timeout.
 *
 * The row is created *before* the job is published and before indexing runs, which is the reverse
 * of the old order and the point of the change. Previously the insert came last, so a timeout mid
 * embed left no row at all — the upload simply vanished, while any vectors already upserted stayed
 * behind with nothing to delete them by. Now the document always exists, carrying its own status.
 *
 * The docId is still generated up front so the Qdrant payloads and the DB row share one identity.
 */
async function storeAndQueue(params: {
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
  const rawInput = buffer ?? Buffer.from((text ?? url ?? name) as string, "utf8");
  const contentHash = createHash("sha256").update(rawInput).digest("hex");

  const existing = await prisma.knowledgeDoc.findFirst({
    where: {
      tenantId,
      businessId,
      OR: [
        { metadata: { path: ["contentHash"], equals: contentHash } },
        ...(text ? [{ content: { equals: text } }] : []),
      ],
    },
    select: { id: true, metadata: true, name: true },
  });

  if (existing) {
    return { success: false, duplicate: true, skipped: true, error: `Skipped duplicate upload: ${existing.name}` };
  }

  const docId = randomUUID();
  const extracted = await extractDocumentText(type, { buffer, url, text, filename: name });

  const doc = await prisma.knowledgeDoc.create({
    data: {
      id: docId,
      tenantId,
      businessId,
      name,
      type,
      content: extracted,
      ...(url && { url }),
      chunkCount: 0,
      vectorIds: [],
      isIndexed: false,
      metadata: {
        status: "PROCESSING",
        contentHash,
        ...(size != null && { size }),
      },
    },
  });

  if (process.env.SKIP_QUEUE === "true") {
    const { chunkCount, vectorIds } = await ingestDocument({
      tenantId,
      businessId,
      docId,
      type: "TEXT",
      text: extracted,
      filename: name,
    });
    await prisma.knowledgeDoc.update({
      where: { id: docId },
      data: {
        chunkCount,
        vectorIds,
        isIndexed: chunkCount > 0,
        metadata: {
          status: chunkCount > 0 ? "INDEXED" : "FAILED",
          contentHash,
          ...(chunkCount === 0 && { error: "No readable text found in this document." }),
        },
      },
    });
    return { success: true, doc };
  }

  await publishKnowledgeIngest({ tenantId, businessId, docId });

  return { success: true, doc };
}
