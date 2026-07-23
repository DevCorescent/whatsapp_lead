// ============================================================================
// OWNER  : Inbox attachments
// MODULE : Media serving
// ROUTE  : /api/media/[tenantId]/[fileName]
//
// METHODS
// GET    - Stream a stored attachment back to an authenticated agent.
//
// ACCESS
// GET    - Authenticated. The tenant segment of the path must equal the caller's
//          own tenant; a request for another workspace's asset is answered 404,
//          exactly as a non-existent one is, so ownership cannot be probed.
// ============================================================================
//
// Attachments are never public files under `public/` — they are served here so that
// tenant scoping applies to reads as well as writes. Browsers include same-origin
// cookies on `<img>`/`<video>`/`<audio>` requests, so the session auth below works
// transparently for media embedded in message bubbles.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { contentTypeForExtension, fileExtension } from "@/lib/attachments";
import { readMedia } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { path } = await params;
  // The store is exactly two levels deep: <tenantId>/<fileName>. Anything else is a
  // malformed URL, not a miss to disclose the store's shape over.
  if (!Array.isArray(path) || path.length !== 2) {
    return new NextResponse("Not found", { status: 404 });
  }

  const [tenantId, fileName] = path;

  // A globally addressable path is not an authorised one: the asset belongs to the
  // caller only if it sits under the caller's tenant. Foreign reads are indistinguishable
  // from misses.
  if (tenantId !== session.user.tenantId) {
    return new NextResponse("Not found", { status: 404 });
  }

  let bytes: Buffer | null;
  try {
    bytes = await readMedia(tenantId, fileName);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  if (!bytes) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": contentTypeForExtension(fileExtension(fileName)),
      "Content-Length": String(bytes.byteLength),
      // Private: this asset is tenant-scoped and must never be shared by a proxy cache.
      "Cache-Control": "private, max-age=3600",
      // Never let a browser second-guess the declared type — the guard against an
      // uploaded ".png" that is really a script.
      "X-Content-Type-Options": "nosniff",
      // Renders inline in bubbles; the sandboxed CSP neutralises any active content
      // (e.g. scripts inside an SVG) if the URL is ever opened directly.
      "Content-Disposition": "inline",
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; media-src 'self'; sandbox",
    },
  });
}
