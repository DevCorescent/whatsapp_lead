// ============================================================================
// MODULE : Media storage (server-only)
//
// A thin, tenant-partitioned object store for inbox attachments backed by the
// local filesystem. There is no existing storage layer in the codebase and no
// cloud client installed, so uploads land on disk under a per-tenant directory;
// swapping this file for an S3/GCS implementation later needs no change to its
// callers, which only ever see the `save`/`read` contract.
//
// Tenant isolation is structural: every asset lives beneath `<base>/<tenantId>/`,
// and both the writer and the reader validate the tenant and file segments against
// strict patterns before they touch the filesystem, so a crafted id can never walk
// out of its tenant's directory.
// ============================================================================

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Root of the media store.
 *
 * Configurable so a deployment can point it at a mounted volume; defaults to an
 * `uploads/` directory at the project root (gitignored). Kept outside `public/`
 * on purpose — assets are served through an authenticated route, never as static
 * files, so tenant scoping cannot be bypassed by guessing a path.
 */
const BASE_DIR = process.env.MEDIA_UPLOAD_DIR
  ? path.resolve(process.env.MEDIA_UPLOAD_DIR)
  : path.join(process.cwd(), "uploads");

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
  /** Authenticated URL the browser fetches the asset from. */
  url: string;
}

/**
 * Persist an uploaded asset under its tenant and return its handle.
 *
 * The file name is a fresh UUID rather than the user's original name: two agents
 * uploading `invoice.pdf` must not collide, and the original name is preserved as
 * message metadata for display, not as the storage key.
 */
export async function saveMedia(
  tenantId: string,
  extension: string,
  bytes: Buffer
): Promise<StoredMedia> {
  const ext = extension.toLowerCase();
  const fileName = `${randomUUID()}.${ext}`;
  assertSafe(tenantId, fileName);

  const dir = path.join(BASE_DIR, tenantId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), bytes);

  return { fileName, url: `/api/media/${tenantId}/${fileName}` };
}

/**
 * Read a stored asset back, or null when it does not exist.
 *
 * The caller is responsible for having already checked that `tenantId` matches the
 * requesting session; this function only guards against path traversal, not against
 * cross-tenant access.
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
