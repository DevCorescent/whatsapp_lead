# Queue & Cache Layer — Intern Implementation Guide

**Stack:** Upstash Redis (cache) · Upstash QStash (job queue / pub-sub)  
**Why:** The current webhook processes everything inline — DB writes, AI calls, WhatsApp sends — all inside the same request that Meta is waiting on. If any step takes too long, Meta marks the delivery failed and retries, causing duplicate messages. Redis removes repeated DB hits; QStash moves the slow work out of the request entirely.

---

## 1. Mental Model

### Before (current state)
```
Meta sends message
  → POST /api/webhook/whatsapp
      → resolveTenant()         DB hit every time
      → upsertContact()         DB hit
      → saveInboundMessage()    DB hit
      → AI generateReply()      3–8 seconds (Groq/OpenRouter)
      → sendTextMessage()       Meta API call
  ← 200 OK (after 5–10 seconds)

Problem: Meta times out at ~5s, marks delivery failed, retries → duplicate AI replies
```

### After (target state)
```
Meta sends message
  → POST /api/webhook/whatsapp
      → Redis: resolve tenant   0 DB hit if cached
      → QStash: publish job     1 HTTP call, < 100ms
  ← 200 OK (in < 200ms)

QStash delivers job to → POST /api/workers/inbound
      → DB writes (contact, message)
      → Flow engine OR publish AI job to QStash

QStash delivers AI job to → POST /api/workers/ai-reply
      → Redis: check reply cache
      → if miss: call AI, cache result
      → sendTextMessage()

Campaign scheduled
  → QStash holds it until scheduledAt, then delivers to → POST /api/workers/campaign-send
```

---

## 2. Environment Variables (already in .env)

```
UPSTASH_REDIS_REST_URL        Redis connection URL
UPSTASH_REDIS_REST_TOKEN      Redis auth token

QSTASH_URL                    QStash API base URL
QSTASH_TOKEN                  Used to PUBLISH jobs (server → QStash)
QSTASH_CURRENT_SIGNING_KEY    Used to VERIFY jobs (QStash → your worker route)
QSTASH_NEXT_SIGNING_KEY       Rotated key, verify against both
```

---

## 3. Install the SDKs

```bash
npm install @upstash/redis @upstash/qstash
```

---

## 4. Files to Create

### 4.1 `lib/cache.ts` — Redis wrapper

This is the ONLY file that should ever import `@upstash/redis`. Everything else goes through these helpers.

```ts
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export default redis;

// ─── Typed helpers ────────────────────────────────────────────────────────────

/** Resolved tenant + businessId, keyed by WhatsApp phoneNumberId. TTL: 5 minutes. */
const TENANT_RESOLVE_TTL = 300;
export async function cachedResolveTenant(
  phoneNumberId: string,
  fallback: () => Promise<{ tenantId: string; businessId: string }>
): Promise<{ tenantId: string; businessId: string }> {
  const key = `tenant:resolve:${phoneNumberId}`;
  const cached = await redis.get<{ tenantId: string; businessId: string }>(key);
  if (cached) return cached;
  const value = await fallback();
  await redis.set(key, value, { ex: TENANT_RESOLVE_TTL });
  return value;
}

/** Decrypted WhatsApp credentials for a businessId. TTL: 5 minutes. */
const CREDS_TTL = 300;
export async function cachedBusinessCreds(
  businessId: string,
  fallback: () => Promise<{ phoneNumberId: string; apiKey: string } | null>
): Promise<{ phoneNumberId: string; apiKey: string } | null> {
  const key = `business:creds:${businessId}`;
  const cached = await redis.get<{ phoneNumberId: string; apiKey: string }>(key);
  if (cached) return cached;
  const value = await fallback();
  if (value) await redis.set(key, value, { ex: CREDS_TTL });
  return value;
}

/** AI reply cache — avoids re-calling the model for identical inputs. TTL: 1 hour. */
const AI_REPLY_TTL = 3600;
export async function cachedAiReply(
  cacheKey: string,
  fallback: () => Promise<string>
): Promise<string> {
  const key = `ai:reply:${cacheKey}`;
  const cached = await redis.get<string>(key);
  if (cached) return cached;
  const value = await fallback();
  if (value) await redis.set(key, value, { ex: AI_REPLY_TTL });
  return value;
}

/** Invalidate tenant cache when business credentials are updated. */
export async function invalidateTenantCache(phoneNumberId: string) {
  await redis.del(`tenant:resolve:${phoneNumberId}`);
}

export async function invalidateCredsCache(businessId: string) {
  await redis.del(`business:creds:${businessId}`);
}
```

---

### 4.2 `lib/queue.ts` — QStash publisher

This is the ONLY file that should ever publish to QStash. Workers import this to enqueue jobs.

```ts
import { Client } from "@upstash/qstash";

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

/** The public URL of this deployment. Workers are called via HTTP by QStash. */
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://whatsapp-lead-five.vercel.app";

// ─── Job types ────────────────────────────────────────────────────────────────

export interface InboundMessageJob {
  tenantId: string;
  businessId: string;
  phoneNumberId: string;
  waMessageId: string;
  from: string;
  contactName?: string;
  type: string;
  content: string | null;
  timestamp: string;
  rawMessage: unknown;
}

export interface AiReplyJob {
  tenantId: string;
  businessId: string;
  conversationId: string;
  contactPhone: string;
}

export interface CampaignSendJob {
  campaignId: string;
  recipientId: string;    // CampaignContact.id
  phone: string;
  message: string;
  businessId: string;
}

// ─── Publishers ───────────────────────────────────────────────────────────────

/**
 * Enqueue one inbound WhatsApp message for background processing.
 * The webhook calls this and returns 200 immediately.
 */
export async function publishInboundMessage(job: InboundMessageJob) {
  return qstash.publishJSON({
    url: `${APP_URL}/api/workers/inbound`,
    body: job,
    retries: 3,
  });
}

/**
 * Enqueue an AI auto-reply for a conversation.
 * Called by the inbound worker after saving the message.
 */
export async function publishAiReply(job: AiReplyJob, delaySeconds = 0) {
  return qstash.publishJSON({
    url: `${APP_URL}/api/workers/ai-reply`,
    body: job,
    delay: delaySeconds,   // honours autoReplyDelay setting
    retries: 2,
  });
}

/**
 * Enqueue one campaign recipient send.
 * Called per-recipient so each send is individually retryable.
 */
export async function publishCampaignSend(
  job: CampaignSendJob,
  notBefore?: Date   // pass scheduledAt for scheduled campaigns
) {
  return qstash.publishJSON({
    url: `${APP_URL}/api/workers/campaign-send`,
    body: job,
    notBefore: notBefore ? Math.floor(notBefore.getTime() / 1000) : undefined,
    retries: 3,
  });
}
```

---

### 4.3 `lib/qstash-verify.ts` — Signature verifier

Every worker route MUST call this first. Without it, anyone on the internet can POST to your worker routes and trigger campaign sends, AI calls, etc.

```ts
import { Receiver } from "@upstash/qstash";
import { NextRequest } from "next/server";

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

/**
 * Verify that this request was sent by QStash, not an external caller.
 * Returns true if valid. Returns false if the signature is missing or wrong.
 * Worker routes must return 401 when this returns false.
 */
export async function verifyQStashSignature(req: NextRequest): Promise<boolean> {
  try {
    const signature = req.headers.get("upstash-signature");
    if (!signature) return false;
    const body = await req.text();
    await receiver.verify({ signature, body });
    return true;
  } catch {
    return false;
  }
}
```

---

## 5. Worker Routes to Create

Each worker route lives at `app/api/workers/`. QStash calls these via HTTP POST. They do the actual work that used to happen inline in the webhook.

### 5.1 `app/api/workers/inbound/route.ts`

Receives one inbound WhatsApp message job from QStash.  
Does: contact upsert → conversation find/create → message save → flow engine → enqueue AI reply.  
**Does NOT** call AI or WhatsApp directly — that goes to the next worker.

```ts
import { NextRequest, NextResponse } from "next/server";
import { verifyQStashSignature } from "@/lib/qstash-verify";
import { publishAiReply, type InboundMessageJob } from "@/lib/queue";
import { prisma } from "@/lib/prisma";
// ... import flow engine, contact upsert helpers

export async function POST(req: NextRequest) {
  // 1. Verify this came from QStash
  const valid = await verifyQStashSignature(req);
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const job = await req.json() as InboundMessageJob;

  // 2. Do the DB work (same logic as processIncomingMessage in webhook)
  // ... upsertContact, findOrCreateConversation, saveInboundMessage

  // 3. Run flow engine — if not handled, enqueue AI reply
  // const flowHandled = await executeFlow(...)
  // if (!flowHandled && tenant.aiEnabled && tenant.autoReply) {
  //   await publishAiReply({ ... }, tenant.autoReplyDelay ?? 0)
  // }

  return NextResponse.json({ ok: true });
}
```

### 5.2 `app/api/workers/ai-reply/route.ts`

Receives one AI reply job. Checks Redis cache first.  
Does: load conversation history → check Redis cache → generate reply if miss → cache it → sendTextMessage → save outbound message.

```ts
import { NextRequest, NextResponse } from "next/server";
import { verifyQStashSignature } from "@/lib/qstash-verify";
import { cachedAiReply } from "@/lib/cache";
import { generateReply } from "@/lib/ai";
import { sendTextMessage } from "@/lib/whatsapp";
import { createHash } from "crypto";
import type { AiReplyJob } from "@/lib/queue";

export async function POST(req: NextRequest) {
  const valid = await verifyQStashSignature(req);
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const job = await req.json() as AiReplyJob;

  // Load history + personality from DB
  // const history = await loadConversationHistory(...)
  // const personality = tenant.aiPersonality ?? DEFAULT_AI_PERSONALITY

  // Build a deterministic cache key from the last 3 messages + personality
  // const cacheKey = createHash("sha256")
  //   .update(personality + JSON.stringify(history.slice(-3)))
  //   .digest("hex");

  // const reply = await cachedAiReply(cacheKey, () =>
  //   generateReply(history, personality, knowledgeContext, tenant.aiModel)
  // );

  // await sendTextMessage(phoneNumberId, apiKey, job.contactPhone, reply)
  // await saveOutboundMessage(...)

  return NextResponse.json({ ok: true });
}
```

### 5.3 `app/api/workers/campaign-send/route.ts`

Receives one per-recipient campaign send job.  
Does: resolve credentials → sendTextMessage → update CampaignContact → update campaign counters.  
Since each recipient is its own job, a failed send doesn't block others and QStash retries it automatically.

```ts
import { NextRequest, NextResponse } from "next/server";
import { verifyQStashSignature } from "@/lib/qstash-verify";
import { cachedBusinessCreds } from "@/lib/cache";
import { resolveWhatsAppCreds } from "@/lib/business";
import { sendTextMessage } from "@/lib/whatsapp";
import { prisma } from "@/lib/prisma";
import type { CampaignSendJob } from "@/lib/queue";

export async function POST(req: NextRequest) {
  const valid = await verifyQStashSignature(req);
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const job = await req.json() as CampaignSendJob;

  const creds = await cachedBusinessCreds(job.businessId, () =>
    resolveWhatsAppCreds(job.businessId)
  );
  if (!creds) return NextResponse.json({ error: "No creds" }, { status: 500 });

  try {
    const personalised = job.message
      // Apply {{name}} {{phone}} etc from CampaignContact.variables
      .replace("{{phone}}", job.phone);

    const sent = await sendTextMessage(creds.phoneNumberId, creds.apiKey, job.phone, personalised);
    const waId = sent.messages?.[0]?.id ?? null;

    await prisma.campaignContact.update({
      where: { id: job.recipientId },
      data: { status: "SENT", sentAt: new Date(), waMessageId: waId },
    });
    await prisma.campaign.update({
      where: { id: job.campaignId },
      data: { sentCount: { increment: 1 } },
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown error";
    await prisma.campaignContact.update({
      where: { id: job.recipientId },
      data: { status: "FAILED", failedReason: reason },
    });
    await prisma.campaign.update({
      where: { id: job.campaignId },
      data: { failedCount: { increment: 1 } },
    });
    // Return 500 so QStash retries this recipient
    return NextResponse.json({ error: reason }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

---

## 6. Modify Existing Files

### 6.1 `app/api/webhook/whatsapp/route.ts`

**Change:** Instead of calling `processIncomingMessage()` inline, publish to QStash.

```ts
// BEFORE (current)
await processIncomingMessage(tenant, message, profile?.profile?.name);

// AFTER
await publishInboundMessage({
  tenantId: tenant.tenantId,
  businessId: tenant.businessId,
  phoneNumberId: metadata.phone_number_id,
  waMessageId: message.id,
  from: message.from,
  contactName: profile?.profile?.name,
  type: message.type,
  content: extractContent(message),
  timestamp: message.timestamp,
  rawMessage: message,
});
// processIncomingMessage moves entirely into /api/workers/inbound
```

Also wrap `resolveTenant()` with Redis cache:

```ts
// In resolveTenant(), add cache layer:
import { cachedResolveTenant } from "@/lib/cache";

const cached = await cachedResolveTenant(phoneNumberId, async () => {
  // existing DB lookup code
  return { tenantId: settings.tenantId, businessId };
});
```

### 6.2 `app/api/campaigns/route.ts` (the POST that creates a campaign)

**Change:** Instead of the `sendCampaign()` loop that runs inside the request, enqueue each recipient individually to QStash.

```ts
// BEFORE (current) — blocks for the entire send duration
await sendCampaign(credentials, campaign, recipients);

// AFTER — enqueue each recipient as a separate QStash job
for (const recipient of recipients) {
  await publishCampaignSend(
    {
      campaignId: campaign.id,
      recipientId: recipient.id,
      phone: recipient.phone,
      message: input.message,
      businessId,
    },
    scheduledAt ?? undefined   // QStash holds it until scheduledAt if set
  );
}
// Set campaign status to SCHEDULED or RUNNING, return immediately
```

### 6.3 `app/api/settings/[section]/route.ts` or wherever credentials are updated

When a business updates its WhatsApp credentials, invalidate the cache:

```ts
import { invalidateCredsCache, invalidateTenantCache } from "@/lib/cache";

// After saving new credentials:
await invalidateCredsCache(businessId);
await invalidateTenantCache(business.whatsappPhoneNumberId);
```

---

## 7. Local Development

QStash cannot call `localhost` because it's a cloud service. Two options during local dev:

**Option A — Skip QStash locally, call workers directly**  
Add a `SKIP_QUEUE=true` env var. When set, the webhook calls the worker function directly instead of publishing to QStash. Remove this guard before deploying.

```ts
if (process.env.SKIP_QUEUE === "true") {
  // call worker function directly for local dev
  await processIncomingMessage(...)
} else {
  await publishInboundMessage(...)
}
```

**Option B — Use ngrok to expose localhost**  
Run `ngrok http 3000` → copy the HTTPS URL → set `NEXT_PUBLIC_APP_URL` to it in `.env.local`. QStash can now reach your local routes. Requires ngrok account (free tier works).

---

## 8. Implementation Order (do this in sequence)

- [ ] `npm install @upstash/redis @upstash/qstash`
- [ ] Create `lib/cache.ts`
- [ ] Create `lib/queue.ts`
- [ ] Create `lib/qstash-verify.ts`
- [ ] Create `app/api/workers/inbound/route.ts` (move logic from webhook)
- [ ] Create `app/api/workers/ai-reply/route.ts` (move AI logic from webhook)
- [ ] Create `app/api/workers/campaign-send/route.ts` (move send loop from campaigns)
- [ ] Update `app/api/webhook/whatsapp/route.ts` — publish to queue, add Redis cache
- [ ] Update `app/api/campaigns/route.ts` — publish per-recipient, don't send inline
- [ ] Invalidate cache in settings update routes
- [ ] Test end-to-end on Vercel (not localhost) with a real WhatsApp message

---

## 9. Key Rules

1. **Workers must verify the QStash signature** (`verifyQStashSignature`) as the very first thing. If this check is skipped, the routes are publicly callable with no auth.

2. **Workers must return 2xx for success, non-2xx for failure.** QStash uses the HTTP status code to decide whether to retry. A 500 means "retry this job". A 200 means "done, don't retry".

3. **Workers must be idempotent.** QStash delivers at-least-once. If the same message arrives twice (retry after a crash mid-job), running the logic twice must not corrupt data. The `waMessageId @unique` constraint on Message already handles this for inbound messages. Campaign sends use `status: "SENT"` — check it before re-sending.

4. **Never import `@upstash/redis` or `@upstash/qstash` directly in route files.** Always go through `lib/cache.ts` and `lib/queue.ts`. This makes it easy to swap providers and keeps credentials in one place.

5. **Cache TTLs are short by design.** 5 minutes for credentials means a credential update takes at most 5 minutes to propagate to the webhook. If faster is needed, call `invalidateCredsCache()` explicitly on save.
