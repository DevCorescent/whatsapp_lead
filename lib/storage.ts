// ============================================================================
// MODULE : Media storage (server-only)
//
// Tenant-partitioned object store for inbox attachments.
//
// Production (Uploadthing): when UPLOADTHING_TOKEN is present, files are
// uploaded via UTApi and a permanent public CDN URL is returned. No serve
// route is involved — the URL is served directly from Uploadthing's CDN.
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
   * - With Uploadthing: a permanent public CDN URL (utfs.io/f/…).
   * - Without it: an authenticated /api/media/… URL (local dev only).
   */
  url: string;
}

/**
 * Persist an uploaded asset and return its handle.
 *
 * Uses Uploadthing's UTApi when UPLOADTHING_TOKEN is set (production). Falls
 * back to the local filesystem for local development. The returned URL is
 * always absolute and loadable by the browser.
 */
export async function saveMedia(
  tenantId: string,
  extension: string,
  bytes: Buffer,
  opts?: { mimeType?: string; originalName?: string }
): Promise<StoredMedia> {
  const ext = extension.toLowerCase();
  const fileName = `${randomUUID()}.${ext}`;
  assertSafe(tenantId, fileName);

  if (process.env.UPLOADTHING_TOKEN) {
    const { UTApi, UTFile } = await import("uploadthing/server");
    const utapi = new UTApi();

    // UTFile accepts a Blob/ArrayBuffer and takes a name + optional type.
    const mimeType = opts?.mimeType ?? "application/octet-stream";
    const uploadName = opts?.originalName ?? fileName;
    // Slice to a plain ArrayBuffer so TypeScript's strict BlobPart check is satisfied
    // (Buffer's underlying .buffer may be a SharedArrayBuffer on some runtimes).
    const slice = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const utFile = new UTFile([slice], uploadName, { type: mimeType });

    const result = await utapi.uploadFiles(utFile);
    if (result.error) {
      throw new Error(`Uploadthing upload failed: ${result.error.message}`);
    }

    const url = result.data.ufsUrl ?? result.data.url;
    console.log(`[STORAGE] Uploadthing upload OK → ${url}`);
    return { fileName, url };
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
 * Only used on the local-filesystem path; with Uploadthing the browser loads
 * the public CDN URL directly and /api/media/[...path] is not involved.
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
