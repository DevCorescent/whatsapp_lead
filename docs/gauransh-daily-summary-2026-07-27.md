# Gauransh Daily Summary — 2026-07-27

## What was shipped today (feature/gauransh-whatsapp-leads → main)

---

### 1. Redis + QStash Production Architecture (`d6bb018`)

The core infrastructure overhaul. The entire inbound/outbound pipeline now runs off the request path.

**New libraries:**
- `lib/cache.ts` — Redis wrapper with 500 ms timeout, graceful fallback on outage. Caches tenant resolution, business credentials, and AI replies to avoid repeat DB/API calls.
- `lib/inbound.ts` — Extracted the full inbound processing spine out of the webhook route. `processIncomingMessage`, `handleAutoReply`, `executeFlow`, `dispatchAutoReply` now live here and are shared between the webhook and the test endpoint.
- `lib/qstash-verify.ts` — Verifies the `upstash-signature` header on every worker POST. Unsigned requests get 401.
- `lib/queue.ts` — Job publishers: `publishInboundMessage`, `publishAiReply`, `publishCampaignSend`.

**New worker routes (all QStash-delivered):**
- `app/api/workers/inbound/route.ts` — Processes one inbound WhatsApp message. Resolves tenant by stored IDs, calls `processIncomingMessage`. QStash at-least-once is safe: `waMessageId` unique constraint makes duplicate deliveries no-ops.
- `app/api/workers/ai-reply/route.ts` — Runs the AI completion and sends the WhatsApp reply. Decoupled from the inbound worker so a slow model call doesn't block message save.
- `app/api/workers/campaign-send/route.ts` — Sends one campaign batch. Migrated from cron inline send.

**Routes refactored:**
- `app/api/webhook/whatsapp/route.ts` — Slimmed from ~1100 lines to a verify-and-dispatch shell. Publishes an `InboundMessageJob` per message and returns 200 to Meta immediately.
- `app/api/campaigns/route.ts` — Campaign sends now dispatch to QStash instead of running inline.
- `app/api/cron/campaigns/route.ts` — Cron now schedules via QStash, not inline.
- `app/api/businesses/[id]/route.ts` + `app/api/settings/route.ts` — Cache invalidation hooks added on update.

**Packages added:** `@upstash/redis`, `@upstash/qstash`

---

### 2. Debug Logging (`39a6be1`)

Added `[WEBHOOK]` and `[WORKER INBOUND]` console.log calls to trace message flow through the pipeline: signature verification, entry processing, tenant resolution, job dispatch, and processing result.

---

### 3. Simulate-Inbound Test Endpoint (`2f8802b`)

`app/api/test/simulate-inbound/route.ts` — Injects a fake inbound message directly into the pipeline, bypassing Meta's webhook (Meta only delivers to published apps in production mode). Gated by `CRON_SECRET` Bearer token. Body: `{ from, message, name?, phoneNumberId? }`.

**Why it exists:** Meta Development mode blocks real webhook delivery to unpublished apps. This endpoint lets the team test the full AI-reply and flow-engine pipeline on localhost or staging without publishing the Meta app.

---

### 4. WhatsApp Credentials Bug Fix (`a0b19e6`)

**Root cause:** `handleAutoReply` and `executeFlow` in `lib/inbound.ts` were reading `tenant.waPhoneNumberId` and `tenant.waApiKey` from `TenantSettings`. For multi-business workspaces these fields are null — credentials live on the `Business` table.

**Fix:** Both functions now call `resolveWhatsAppCreds(tenant.businessId)` from `lib/business.ts`, which reads from `Business` first and falls back to `TenantSettings`.

---

### 5. Knowledge Base Async Pipeline + Production Hardening (`02898e2`)

**Problem:** Embedding 150 chunks at ~66 ms each held the upload request for 10+ seconds — longer than a serverless function lifetime. A timeout killed the row insert that came after the embeds, leaving vectors orphaned in Qdrant with nothing to delete them by.

**Solution:** Upload stores the document and returns. A QStash job does the slow work.

**New:**
- `app/api/workers/knowledge-ingest/route.ts` — QStash worker. Chunks → embeds → upserts vectors → marks `isIndexed: true`. Idempotent: clears old vectors by `docId` before upserting, skips if already indexed. Failure is recorded on the row (`status: FAILED` + reason) so the UI shows an error instead of a permanent spinner.
- `lib/queue.ts` — Added `publishKnowledgeIngest` / `KnowledgeIngestJob`.
- `hooks/useMessages.ts` — Real-time message hook (Pusher).
- `components/inbox/ChatWindow.tsx` — Wired to `useMessages` for live inbox updates.

**Changed:**
- `lib/rag.ts` — `retrieveContext` now takes `businessId` as a required 2nd argument. Qdrant filter is now `tenantId AND businessId` (was tenant-only). Prevents cross-business knowledge leakage when a tenant runs multiple businesses.
- `lib/rag.ts` — `deleteDocumentVectors` now takes `businessId` as a required 2nd argument.
- `lib/embeddings.ts` — Production hardening (retry logic, error surfacing).
- `lib/qdrant.ts` — `ensureCollection` creates payload indexes for `tenantId` and `businessId` so the AND filter uses indexes.
- `lib/ai.ts` — Model resolution and token budget improvements.
- `app/api/knowledge/route.ts` — Upload route now dispatches QStash job instead of embedding inline.
- `app/api/knowledge/[id]/route.ts` — DELETE cleans up vectors via `deleteDocumentVectors`.
- `tests/knowledge-hardening.test.ts` — Test suite for the async ingest path.

---

## TypeScript fixes applied on merge (by Yash)

After the merge, 4 type errors needed fixing before the build was clean:

| File | Error | Fix |
|------|-------|-----|
| `app/api/workers/knowledge-ingest/route.ts:113` | `doc` not in scope inside `catch` block | Use `existingMetadata` (declared before `try`) |
| `lib/inbound.ts:838` | `retrieveContext` called with 2 args, now needs 3 | Added `tenant.businessId` as 2nd arg |
| `scripts/test-rag-app.ts:34` | `{ limit, scoreThreshold }` passed as query arg | Added `BUSINESS_ID` constant, moved opts to 4th arg |
| `scripts/test-rag-app.ts:39` | `deleteDocumentVectors` called with 2 args, now needs 3 | Added `BUSINESS_ID` as 2nd arg |

---

## What's still needed before AI auto-reply works end-to-end

1. **Enable AI in settings** — `aiEnabled: true` + `autoReply: true` must be toggled on in the AI Settings page for the tenant.
2. **Meta app publishing** — Real WhatsApp messages from real numbers only flow through the webhook once the Meta app is approved and published. Until then, use `POST /api/test/simulate-inbound` to test the pipeline.
3. **Remove simulate-inbound before go-live** — `app/api/test/simulate-inbound/route.ts` is marked as temporary and must be deleted before production launch.
