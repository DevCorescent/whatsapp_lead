// ============================================================================
// MODULE : Cache (Upstash Redis)
// ============================================================================
//
// The single Redis boundary in the application. Nothing outside this file may
// import `@upstash/redis` — routes and workers reach the cache only through the
// typed helpers below, so the provider, the key vocabulary and the TTLs are all
// decided in exactly one place.
//
// Every helper is read-through: it takes the fallback that produces the value
// from the source of truth (Prisma, or the model) and is responsible only for
// short-circuiting the repeat. A cache miss is therefore never an error — it is
// the ordinary path with one extra write — and a Redis outage degrades these to
// the behaviour the callers had before the cache existed.
//
// TTLs are deliberately short. Credentials cached for five minutes mean a
// credential change takes at most five minutes to reach the webhook; callers
// that need it sooner call the matching invalidate* helper on save rather than
// waiting the window out.

import { Redis } from "@upstash/redis";

/**
 * Longest a single cache operation may take before the caller gives up and uses the database.
 *
 * A cache lookup that has not answered in half a second is not worth waiting for: the query it
 * was meant to save takes a few milliseconds, so this still leaves roughly fifty times the
 * headroom a healthy call needs. Without a bound there is none — an Upstash endpoint that accepts
 * the connection and then stops responding leaves the request hanging until the platform kills
 * the function, which for the WhatsApp webhook means Meta never receives its 200, marks the
 * delivery failed, and redelivers.
 *
 * The bound is per operation, so a webhook miss (a read, then a write) costs at most twice this
 * against a dead endpoint — about a second, comfortably inside the few seconds Meta allows.
 */
const REDIS_TIMEOUT_MS = 500;

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  // The client defaults to five attempts with `exp(n) * 50ms` backoff, which spends roughly
  // 4.4 seconds failing before it reports an outage. That is longer than Meta's whole webhook
  // budget, so the default turns a Redis outage — which this module is built to shrug off — into
  // failed deliveries and duplicate inbound messages. One quick retry absorbs a blip; anything
  // beyond that is better spent on the database.
  retry: { retries: 1, backoff: () => 50 },
});

export default redis;

/**
 * Bound an operation in time, and make sure a late failure cannot escape.
 *
 * `Promise.race` leaves the losing promise running, so the Redis call may still reject after the
 * timeout has already sent the caller to the database. A rejection with no handler would surface
 * as an unhandled rejection and, depending on the runtime, take the process down — so the
 * original is given a no-op catch before the race. The timer is always cleared: a pending timer
 * keeps a serverless function alive after it has finished its work.
 */
function withTimeout<T>(operation: Promise<T>, key: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Redis operation timed out after ${REDIS_TIMEOUT_MS}ms for "${key}"`)),
      REDIS_TIMEOUT_MS
    );
  });

  operation.catch(() => {});

  return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
}

// ─── Failure containment ──────────────────────────────────────────────────────
//
// Every Redis operation in this file goes through one of these three wrappers, and none of
// them can throw. This is the property the rest of the application depends on.
//
// The Upstash client throws on any transport failure — an unreachable host surfaces as a
// plain `TypeError: fetch failed`. Left uncontained, that error propagates out of a cache
// helper, out of the webhook's `processChange`, and into the handler's catch-all, which
// answers Meta 200 regardless. Meta reads 200 as "delivered successfully" and never retries,
// so an Upstash outage would silently and permanently destroy every inbound customer message
// for its duration. A cache is an optimisation; it must never be able to do that.
//
// So a read failure is reported as a miss, which sends the caller to the database it used
// before the cache existed, and a write failure is dropped. The cost of both is a slow path,
// never a wrong answer — the fallback is always the source of truth.

/** Read a key. Any Redis failure is reported as a miss so the caller falls back to the database. */
async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    return await withTimeout(redis.get<T>(key), key);
  } catch (error) {
    console.error(`[CACHE] Read failed for "${key}" — falling back to source:`, error);
    return null;
  }
}

/** Write a key, best-effort. A failure only costs the next caller a cache miss. */
async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    await withTimeout(redis.set(key, value, { ex: ttlSeconds }), key);
  } catch (error) {
    console.error(`[CACHE] Write failed for "${key}":`, error);
  }
}

/**
 * Delete a key, best-effort.
 *
 * A failure here is the one case that degrades rather than merely slows: the stale entry
 * survives until its TTL expires, so an invalidation that could not be delivered means up to
 * five more minutes of stale credentials. That is still strictly better than throwing, which
 * would fail the settings save that triggered it and leave the caller unable to store the new
 * value at all — and the TTL guarantees the staleness is bounded.
 */
async function cacheDel(key: string): Promise<void> {
  try {
    await withTimeout(redis.del(key), key);
  } catch (error) {
    console.error(`[CACHE] Invalidation failed for "${key}":`, error);
  }
}

// ─── Typed helpers ────────────────────────────────────────────────────────────

/** Resolved tenant + businessId, keyed by WhatsApp phoneNumberId. TTL: 5 minutes. */
const TENANT_RESOLVE_TTL = 300;
export async function cachedResolveTenant(
  phoneNumberId: string,
  fallback: () => Promise<{ tenantId: string; businessId: string }>
): Promise<{ tenantId: string; businessId: string }> {
  const key = `tenant:resolve:${phoneNumberId}`;
  const cached = await cacheGet<{ tenantId: string; businessId: string }>(key);
  if (cached) return cached;
  const value = await fallback();
  await cacheSet(key, value, TENANT_RESOLVE_TTL);
  return value;
}

/** Decrypted WhatsApp credentials for a businessId. TTL: 5 minutes. */
const CREDS_TTL = 300;
export async function cachedBusinessCreds(
  businessId: string,
  fallback: () => Promise<{ phoneNumberId: string; apiKey: string } | null>
): Promise<{ phoneNumberId: string; apiKey: string } | null> {
  const key = `business:creds:${businessId}`;
  const cached = await cacheGet<{ phoneNumberId: string; apiKey: string }>(key);
  if (cached) return cached;
  const value = await fallback();
  if (value) await cacheSet(key, value, CREDS_TTL);
  return value;
}

/** AI reply cache — avoids re-calling the model for identical inputs. TTL: 1 hour. */
const AI_REPLY_TTL = 3600;
export async function cachedAiReply(
  cacheKey: string,
  fallback: () => Promise<string>
): Promise<string> {
  const key = `ai:reply:${cacheKey}`;
  const cached = await cacheGet<string>(key);
  if (cached) return cached;
  const value = await fallback();
  if (value) await cacheSet(key, value, AI_REPLY_TTL);
  return value;
}

/** Invalidate tenant cache when business credentials are updated. */
export async function invalidateTenantCache(phoneNumberId: string) {
  await cacheDel(`tenant:resolve:${phoneNumberId}`);
}

export async function invalidateCredsCache(businessId: string) {
  await cacheDel(`business:creds:${businessId}`);
}
