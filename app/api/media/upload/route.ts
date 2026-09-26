// ============================================================================
// OWNER  : Inbox attachments
// MODULE : Media upload
// ROUTE  : /api/media/upload?conversationId=<id>
//
// METHODS
// POST   - Accept one or more attachment files, validate them, upload to Meta's
//          Media Upload API, and store locally for CRM display.
//
// ACCESS
// POST   - Authenticated. Every file is stored under the caller's tenant, so an
//          upload can never land in — nor be addressable from — another workspace.
// ============================================================================
//
// Files are uploaded to Meta's servers via the Upload API and the returned media_id
// is what the send route uses. This avoids the need to serve the file publicly from
// our own infrastructure (which is unreliable on a serverless/ephemeral filesystem).
// The local file is kept solely for CRM display in the same browser session.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveConversationWhatsAppCreds } from "@/lib/business";
import {
  MAX_ATTACHMENTS,
  fileExtension,
  validateFile,
} from "@/lib/attachments";
import { saveMedia } from "@/lib/storage";
import { uploadMediaToMeta } from "@/lib/whatsapp";

/** Filesystem writes need the Node runtime, not the Edge one. */
export const runtime = "nodejs";

/** Metadata returned per stored file, merged into the optimistic message client-side. */
interface UploadedMedia {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  category: string;
  /** Meta media ID — present when WhatsApp creds were resolved via conversationId. */
  mediaId?: string;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { tenantId } = session.user;

  // If the caller provides conversationId we can resolve WhatsApp creds and pre-upload
  // to Meta — files are then sent by media_id instead of URL, which is reliable on
  // serverless runtimes where the local filesystem is not shared between instances.
  const conversationId = req.nextUrl.searchParams.get("conversationId");
  let waCreds: { phoneNumberId: string; apiKey: string } | null = null;

  if (conversationId) {
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
      include: { contact: true },
    });
    if (conv) {
      const resolved = await resolveConversationWhatsAppCreds(conv);
      if (resolved.phoneNumberId && resolved.apiKey) {
        waCreds = { phoneNumberId: resolved.phoneNumberId, apiKey: resolved.apiKey };
      }
    }
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: "Expected a multipart form upload" },
      { status: 400 }
    );
  }

  const files = form.getAll("files").filter((entry): entry is File => entry instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ success: false, error: "No files provided" }, { status: 400 });
  }

  if (files.length > MAX_ATTACHMENTS) {
    return NextResponse.json(
      { success: false, error: `A message can carry at most ${MAX_ATTACHMENTS} attachments` },
      { status: 400 }
    );
  }

  for (const file of files) {
    const result = validateFile({ name: file.name, type: file.type, size: file.size });
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
  }

  try {
    const uploaded: UploadedMedia[] = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());

      if (buffer.byteLength === 0) {
        return NextResponse.json(
          { success: false, error: `"${file.name}" is empty` },
          { status: 400 }
        );
      }

      const spec = validateFile({ name: file.name, type: file.type, size: buffer.byteLength });
      if (!spec.ok || !spec.spec) {
        return NextResponse.json({ success: false, error: spec.error }, { status: 400 });
      }

      const mimeType = file.type || "application/octet-stream";

      // Save locally for CRM display (best-effort; ephemeral on serverless).
      const stored = await saveMedia(tenantId, fileExtension(file.name), buffer);

      // Upload to Meta if we have credentials — the resulting media_id is used
      // for the actual WhatsApp send so Meta never needs to fetch from our server.
      let mediaId: string | undefined;
      if (waCreds) {
        try {
          mediaId = await uploadMediaToMeta(
            waCreds.phoneNumberId,
            waCreds.apiKey,
            buffer,
            mimeType,
            file.name
          );
        } catch (err) {
          console.warn("[MEDIA UPLOAD] Meta pre-upload failed, will fall back to URL send:", err);
        }
      }

      uploaded.push({
        url: stored.url,
        filename: file.name,
        mimeType,
        size: buffer.byteLength,
        category: spec.spec.category,
        ...(mediaId ? { mediaId } : {}),
      });
    }

    return NextResponse.json({ success: true, data: uploaded }, { status: 201 });
  } catch (error) {
    console.error("[MEDIA UPLOAD]", error);
    return NextResponse.json(
      { success: false, error: "Failed to store attachments" },
      { status: 500 }
    );
  }
}
