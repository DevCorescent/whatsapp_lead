// ============================================================================
// MODULE : Media storage (server-only)
//
// Tenant-partitioned object store for inbox attachments.
//
// Production (Vercel Blob): when BLOB_READ_WRITE_TOKEN is present, files are
// uploaded to Vercel's CDN and a permanent public URL is returned. The
// /api/media/[...path] serve route is not involved — the blob URL is served
// directly from Vercel's edge, so there is no auth gate and no ephemeral
// filesystem problem.
//
// Local dev / fallback: without the token, files land on the local filesystem
// under os.tmpdir()/whatscrm-uploads and are served through the authenticated
// /api/media route. This path is not viable on serverless runtimes (the
// filesystem is not shared between function instances), but is fine for local
// development where a single process handles all requests.
// ============================================================================

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** Public base URL — used to build absolute media URLs for local-dev fallback. */
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://whatsapp-lead-five.vercel.app").replace(/\/$/, "");

const BASE_DIR = process.env.MEDIA_UPLOAD_DIR
  ? path.resolve(process.env.MEDIA_UPLOAD_DIR)
  : path.join(os.tmpdir(), "whatscrm-uploads");

/** cuid/uuid-shaped ids and simple extensions only — nothing that can traverse. */
const SEGMENT_RE = /^[a-zA-Z0-9_-]+$/;
const EXTENSION_RE = /^[a-zA-Z0-9]+$/;

function assertSafe(tenantId: string, fileName: string): void {
  const dot = fileName.lastIndexOf(".");
  const stem = dot >= 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot >= 0 ? fileName.slice(dot + 1) : "";
  if (!SEGMENT_RE.test(tenantId) || !SEGMENT_RE.test(stem) || !EXTENSION_RE.test(ext)) {
    throw new Error("Unsafe media path");
  }
}

export interface StoredMedia {
  /** Opaque `<uuid>.<ext>` file name, unique within the tenant. */
  fileName: string;
  /**
   * URL to load the asset from.
   * - With Vercel Blob: a permanent public CDN URL (blob.vercel-storage.com/…).
   * - Without it: an authenticated /api/media/… URL (local dev only).
   */
  url: string;
}

/**
 * Persist an uploaded asset and return its handle.
 *
 * Uses Vercel Blob when BLOB_READ_WRITE_TOKEN is set (production). Falls back
 * to the local filesystem for local development. The returned URL is always
 * absolute and loadable by the browser that owns a session.
 */
export async function saveMedia(
  tenantId: string,
  extension: string,
  bytes: Buffer
): Promise<StoredMedia> {
  const ext = extension.toLowerCase();
  const fileName = `${randomUUID()}.${ext}`;
  assertSafe(tenantId, fileName);

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    // Vercel Blob: persistent CDN storage, public URL, no serve route needed.
    const { put } = await import("@vercel/blob");
    const blob = await put(`${tenantId}/${fileName}`, bytes, {
      access: "public",
      addRandomSuffix: false,
    });
    return { fileName, url: blob.url };
  }

  // Local filesystem fallback (local dev only — not shared between serverless instances).
  const dir = path.join(BASE_DIR, tenantId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), bytes);
  return { fileName, url: `${APP_URL}/api/media/${tenantId}/${fileName}` };
}

/**
 * Read a stored asset back, or null when it does not exist.
 *
 * Only used on the local-filesystem path; on Vercel Blob the browser loads the
 * public CDN URL directly and never calls /api/media/[...path].
 */
export async function readMedia(tenantId: string, fileName: string): Promise<Buffer | null> {
  assertSafe(tenantId, fileName);
  try {
    return await readFile(path.join(BASE_DIR, tenantId, fileName));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
