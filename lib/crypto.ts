// ============================================================================
// MODULE : Secret encryption at rest (AES-256-GCM)
// ============================================================================
//
// Tenant WhatsApp credentials (access token, app secret) are stored encrypted in
// TenantSettings so that a database dump never exposes a token that can send
// messages as the customer's business. Encryption is symmetric and keyed by a
// single deployment-wide secret, ENCRYPTION_KEY.
//
// Two properties keep this safe to introduce into a running system:
//
//  1. Tolerant decrypt. `decryptSecret` returns any value that is not in our
//     versioned envelope format untouched. A workspace that stored a plaintext
//     token before this module existed keeps working, and a deployment with no
//     ENCRYPTION_KEY configured degrades to storing plaintext rather than
//     throwing on every settings read.
//
//  2. Versioned envelope. Ciphertext is prefixed with `enc:v1:` so the format
//     can evolve without a migration and so `decryptSecret` can tell an
//     encrypted value apart from a legacy plaintext one.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ENVELOPE_PREFIX = "enc:v1:";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit nonce — the size GCM is defined for.

/**
 * Derive a stable 32-byte key from the configured passphrase.
 *
 * ENCRYPTION_KEY may be any length (a passphrase, a 64-char hex string, a base64
 * blob); hashing it with SHA-256 yields the fixed 256-bit key AES-256 requires
 * without imposing a format on the operator. Returns null when unconfigured, and
 * every caller treats null as "encryption disabled" rather than an error.
 */
function getKey(): Buffer | null {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) return null;
  return createHash("sha256").update(secret).digest();
}

/** True when a value carries our encryption envelope (rather than being plaintext). */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENVELOPE_PREFIX);
}

/**
 * Encrypt a secret for storage. Returns the value unchanged when no key is
 * configured, so an unconfigured deployment stores plaintext rather than failing
 * to save settings. An empty string is returned as-is — there is nothing to protect.
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return plaintext;
  const key = getKey();
  if (!key) return plaintext;

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return (
    ENVELOPE_PREFIX +
    [iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":")
  );
}

/**
 * Decrypt a stored secret. A value without our envelope (legacy plaintext) is
 * returned unchanged, and a null/empty input passes straight through, so this is
 * safe to call unconditionally at every read site.
 *
 * A genuinely encrypted value with no key available, or one that fails
 * authentication (tampering, wrong key), throws — that is a real configuration
 * error the caller must surface, not silently paper over.
 */
export function decryptSecret(value: string | null | undefined): string | null {
  if (value == null || value === "") return value ?? null;
  if (!isEncrypted(value)) return value;

  const key = getKey();
  if (!key) {
    throw new Error(
      "Encountered an encrypted secret but ENCRYPTION_KEY is not configured — cannot decrypt.",
    );
  }

  const [ivB64, tagB64, dataB64] = value.slice(ENVELOPE_PREFIX.length).split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted secret envelope.");
  }

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/** Whether a stored secret is present, without revealing it — for masked API responses. */
export function hasSecret(value: string | null | undefined): boolean {
  return typeof value === "string" && value.length > 0;
}
