// ============================================================================
// ROUTE  : POST /api/campaigns/upload-media
// Upload a media file (image/video/document) to Meta's servers and return the
// media ID. The ID is then used in campaign jobs instead of a public URL so
// users don't need a CDN — they can pick a file from their desktop.
//
// Meta retains uploaded assets for 30 days. Size caps: image 5 MB,
// video/document 16 MB. The MIME type is read from the file itself.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getBusinessScope, resolveWhatsAppCreds } from "@/lib/business";
import { uploadMedia } from "@/lib/whatsapp";

/** MIME types Meta accepts for WhatsApp template headers. */
const ALLOWED_TYPES = new Set([
  // Images
  "image/jpeg",
  "image/png",
  "image/webp",
  // Video
  "video/mp4",
  "video/3gpp",
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

export async function POST(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ success: false, error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
  }

  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED_TYPES.has(mimeType)) {
    return NextResponse.json(
      { success: false, error: `File type "${mimeType}" is not allowed. Use JPEG, PNG, MP4, or PDF.` },
      { status: 400 },
    );
  }

  // Size guard (16 MB max — enforce before sending to Meta)
  const MAX_BYTES = 16 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { success: false, error: "File is too large. Maximum size is 16 MB." },
      { status: 400 },
    );
  }

  const creds = await resolveWhatsAppCreds(scope.businessId);
  if (!creds.phoneNumberId || !creds.apiKey) {
    return NextResponse.json(
      { success: false, error: "WhatsApp is not connected for this workspace" },
      { status: 409 },
    );
  }

  try {
    const result = await uploadMedia(creds.phoneNumberId, creds.apiKey, file, mimeType);
    return NextResponse.json({ success: true, data: { mediaId: result.id, mimeType } });
  } catch (error) {
    console.error("[UPLOAD MEDIA]", error);
    const msg = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ success: false, error: msg }, { status: 502 });
  }
}
