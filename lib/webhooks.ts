// ============================================================================
// Outgoing webhook delivery
//
// When platform events occur (campaign.completed, message.received, etc.)
// call `dispatchWebhook(tenantId, event, payload)` and all active endpoints
// subscribed to that event receive a signed POST.
//
// Signature: X-Webhook-Signature: sha256=<hmac-hex>
// The receiver verifies with their endpoint secret.
// ============================================================================

import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export const WEBHOOK_EVENTS = [
  "campaign.completed",
  "campaign.failed",
  "message.received",
  "contact.created",
  "contact.updated",
  "broadcast.completed",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export function signPayload(secret: string, body: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

/** Fire-and-forget delivery to all subscribed endpoints for a tenant. */
export async function dispatchWebhook(
  tenantId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { tenantId, isActive: true, events: { has: event } },
  });
  if (endpoints.length === 0) return;

  const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });

  await Promise.allSettled(
    endpoints.map(async (ep) => {
      const signature = signPayload(ep.secret, body);
      const delivery = await prisma.webhookDelivery.create({
        data: { endpointId: ep.id, event, payload: JSON.parse(body), attempts: 1 },
      });
      try {
        const res = await fetch(ep.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Signature": signature,
            "X-Webhook-Event": event,
            "User-Agent": "WhatsCRM-Webhook/1.0",
          },
          body,
          signal: AbortSignal.timeout(10_000),
        });
        const responseText = await res.text().catch(() => "");
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            statusCode: res.status,
            response: responseText.slice(0, 500),
            deliveredAt: res.ok ? new Date() : null,
            error: res.ok ? null : `HTTP ${res.status}`,
          },
        });
      } catch (err) {
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: { error: err instanceof Error ? err.message : "Unknown error" },
        });
      }
    }),
  );
}

/** Generate a cryptographically random API key for incoming API auth. */
export function generateApiKey(): string {
  return "wcrm_" + crypto.randomBytes(24).toString("hex");
}

/** Generate a random webhook signing secret. */
export function generateWebhookSecret(): string {
  return crypto.randomBytes(20).toString("hex");
}
