// ROUTE: POST /api/templates/upload-media
// Upload a sample media file for a template header using Meta's Resumable Upload API.
// Returns a file handle (h field, format "4::aW...") valid for use as header_handle
// in template creation — NOT a regular media_id from /{phone-number-id}/media.

import { NextRequest, NextResponse } from "next/server";
import { getBusinessScope } from "@/lib/business";
import { getBusinessTemplateCreds } from "@/lib/templates";
import { uploadTemplateHeaderMedia } from "@/lib/whatsapp";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/3gpp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export async function POST(req: NextRequest) {
  const scope = await getBusinessScope();
  if (!scope) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData().catch(() => null);
  if (!formData) return NextResponse.json({ success: false, error: "Expected multipart/form-data" }, { status: 400 });

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });

  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED_TYPES.has(mimeType)) {
    return NextResponse.json({ success: false, error: `File type "${mimeType}" is not supported for template headers.` }, { status: 400 });
  }

  const MAX_BYTES = 4 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ success: false, error: "File is too large — maximum 4 MB for template header samples." }, { status: 400 });
  }

  try {
    const { apiKey } = await getBusinessTemplateCreds(scope.businessId);
    const filename = (file instanceof File ? file.name : null) ?? `header.${mimeType.split("/")[1]}`;
    const handle = await uploadTemplateHeaderMedia(apiKey, file, mimeType, filename);
    return NextResponse.json({ success: true, data: { handle } });
  } catch (error) {
    console.error("[TEMPLATE UPLOAD]", error);
    const msg = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ success: false, error: msg }, { status: 502 });
  }
}
