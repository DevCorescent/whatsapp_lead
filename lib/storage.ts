// ============================================================================
// MODULE : Object storage (local filesystem)
// ============================================================================
//
// Persists uploaded originals (knowledge-base documents) to disk under a
// per-tenant directory. This is the fallback path for deployments without an
// S3/R2 bucket — the interface is deliberately small so a cloud backend can be
// swapped in behind it later without touching call sites.
//
// Note on serverless: a platform with an ephemeral filesystem (e.g. Vercel) will
// not retain these files across invocations. Configure a persistent volume, or
// wire an object-store backend here, for durable storage in production. The
// extracted text is always saved in the database regardless, so search and AI
// never depend on the original file surviving.

import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

/** Root of the upload tree; overridable so a mounted volume can be pointed at. */
function uploadRoot(): string {
  return process.env.UPLOAD_DIR ?? path.join(process.cwd(), "storage", "uploads");
}

/** Strip anything that isn't safe in a filename so a crafted name can't escape the dir. */
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "file";
}

export interface StoredFile {
  /** Absolute path on disk. */
  path: string;
  /** Relative key (tenantId/filename) — stored on the record for later retrieval. */
  key: string;
}

/**
 * Save a file for a tenant and return its on-disk path and relative key.
 *
 * The key is prefixed with the tenant id so one workspace's uploads can never
 * collide with, or be addressed as, another's.
 */
export async function saveFile(
  tenantId: string,
  filename: string,
  data: Buffer,
): Promise<StoredFile> {
  const dir = path.join(uploadRoot(), safeName(tenantId));
  await mkdir(dir, { recursive: true });

  // Prefix a short random token so re-uploading the same name never overwrites.
  const { randomBytes } = await import("node:crypto");
  const unique = `${randomBytes(6).toString("hex")}-${safeName(filename)}`;
  const abs = path.join(dir, unique);
  await writeFile(abs, data);

  return { path: abs, key: `${safeName(tenantId)}/${unique}` };
}

/** Read a previously stored file back by its relative key. */
export async function readStoredFile(key: string): Promise<Buffer> {
  const abs = path.join(uploadRoot(), key);
  return readFile(abs);
}
