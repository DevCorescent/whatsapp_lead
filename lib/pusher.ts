// ============================================================================
// OWNER  : Gauransh
// MODULE : Realtime (Pusher server client)
// ============================================================================
//
// Server-side Pusher client used to push inbound and outbound messages to the agent inbox the
// moment they are persisted. Read paths never depend on this — it is a notification channel, not
// a source of truth — so every call site treats a failure here as cosmetic.

import Pusher from "pusher";

/**
 * Realtime channels are scoped per tenant, never per conversation.
 *
 * An agent's inbox shows every conversation in their workspace, so a per-conversation channel
 * would force the client to subscribe and unsubscribe as the agent clicks around and would miss
 * messages arriving in threads they are not currently looking at — precisely the ones the unread
 * badge exists to surface.
 */
export const tenantChannel = (tenantId: string): string => `tenant-${tenantId}`;

/** Events the inbox listens for. Kept here so producer and consumer cannot drift apart. */
export const PusherEvent = {
  NEW_MESSAGE: "new-message",
  MESSAGE_STATUS: "message-status",
} as const;

export type PusherEventName = (typeof PusherEvent)[keyof typeof PusherEvent];

const globalForPusher = globalThis as unknown as {
  pusher: Pusher | null | undefined;
};

/**
 * Build the Pusher client, or null when the workspace has no Pusher credentials.
 *
 * Returning null rather than throwing is deliberate. Realtime is an enhancement layered on top of
 * a database that already holds the truth: a deployment without Pusher configured should still
 * ingest WhatsApp messages correctly, with agents seeing them on their next poll or refresh. The
 * Pusher constructor throws on missing credentials, so an unconfigured environment would otherwise
 * take down the entire webhook at module load — turning a missing nice-to-have into an outage.
 */
function createPusherClient(): Pusher | null {
  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.PUSHER_CLUSTER;

  if (!appId || !key || !secret || !cluster) {
    console.warn(
      "[PUSHER] Credentials not configured — realtime broadcasts are disabled"
    );
    return null;
  }

  return new Pusher({ appId, key, secret, cluster, useTLS: true });
}

/**
 * Singleton, memoised across hot reloads for the same reason `lib/prisma.ts` is: Next.js re-
 * evaluates modules on every edit in development, and a fresh Pusher client per reload leaks a
 * socket pool until the dev server is restarted.
 *
 * Null when unconfigured — callers must guard.
 */
export const pusher: Pusher | null =
  globalForPusher.pusher ?? createPusherClient();

if (process.env.NODE_ENV !== "production") globalForPusher.pusher = pusher;
