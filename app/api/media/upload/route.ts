// ============================================================================
// OWNER  : Inbox attachments
// MODULE : Media upload
// ROUTE  : /api/media/upload
//
// METHODS
// POST   - Accept one or more attachment files, validate them, and store them.
//
// ACCESS
// POST   - Authenticated. Every file is stored under the caller's tenant, so an
//          upload can never land in — nor be addressable from — another workspace.
// ============================================================================
//
// This is the single upload path shared by all three composer entry points (the
// attachment button, drag-and-drop and clipboard paste): they differ only in how
// they gather `File`s, and all POST the same multipart body here. The frontend
// validates first for a fast reject, but this route re-runs the identical rules
// from `lib/attachments` and is the authority — a client that skips or forges the
// client-side check still cannot store anything the rules forbid.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  MAX_ATTACHMENTS,
  fileExtension,
  validateFile,
} from "@/lib/attachments";
import { saveMedia } from "@/lib/storage";

/** Filesystem writes need the Node runtime, not the Edge one. */
export const runtime = "nodejs";

/** Metadata returned per stored file, merged into the optimistic message client-side. */
interface UploadedMedia {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  category: string;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { tenantId } = session.user;

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

  // Validate the whole batch before storing any of it, so a single bad file rejects the
  // request cleanly rather than leaving a half-written set of assets on disk.
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

      // A file that reported a size but arrives empty is corrupt or was truncated in
      // transit — the size check above trusted the header, this trusts the bytes.
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

      const stored = await saveMedia(tenantId, fileExtension(file.name), buffer);
      uploaded.push({
        url: stored.url,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        size: buffer.byteLength,
        category: spec.spec.category,
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
