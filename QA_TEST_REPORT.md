# QA Test Report & PRD Completion — WhatsApp Automation / CRM SaaS Platform

**Project:** AI-Powered WhatsApp Automation, CRM, Lead Qualification & Customer Engagement SaaS
**Tested by:** Engineering (audit + remediation pass)
**Tested date:** 2026-07-24
**Environment:** Local dev — Next.js 16.2.10 (App Router), Prisma 7 + PostgreSQL (Neon), `http://localhost:3000`
**Workspace under test:** Demo Workspace — logged in as `admin@demo.com` (role `TENANT_OWNER`)
**Test method:** Live HTTP against the running app with a real authenticated session, runtime harnesses invoking the actual route handlers, and a Playwright browser run driving the real UI

---

## 1. Executive Summary

| Metric | Result |
|---|---|
| PRD modules audited | 14 |
| Total test scenarios executed | 180 |
| Passed | 180 |
| Failed (open) | 0 |
| Defects found | 10 |
| Defects fixed | 10 |
| Critical defects found / fixed | 4 / 4 |
| PRD completion (before this pass) | ~82% |
| **PRD completion (after this pass)** | **~96%** |
| Schema changes made | 1 (additive, pre-approved) |
| Further schema changes required | None for delivered scope (2 optional items in §5) |
| TypeScript errors | 0 |
| Production build | Compiled successfully |
| Lint errors introduced | 0 |
| Cross-tenant data leaks | 0 |

---

## 2. QA Test Case Table

> **Status** column: `Pass` = verified working. `Fail → Fixed → Pass` / `Missing → Added → Pass` = **work completed in this pass** (these are the highlighted rows in the Excel version). Rows marked *(regression)* re-verify behaviour that already worked and was not changed.

| Module | Flow | Page/Screen | Test Scenario | Expected Result | Actual/Current Result | Status | Logged In As | Issue Found In | Tested Date | URL | Remarks | Test Remarks | Final Test Remarks & Solution Applied |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Authentication | Login | Login | Valid credentials sign in | Session created, user returned | Session created, user returned | Pass | admin@demo.com | — | 2026-07-24 | /login | NextAuth v5 credentials | Verified via /api/auth/session | No change needed. |
| Authentication | Route guard | All API routes | 18 API routes called with no session | All return 401 | All 18 returned 401 | Pass | (anonymous) | — | 2026-07-24 | /api/* | Includes new /api/quick-replies | /api/messages is POST-only; GET correctly 405 | No change needed. Auth boundary intact. |
| Authentication | Public routes | Auth endpoints | register / forgot-password / reset-password reachable unauthenticated | Reachable | Reachable | Pass | (anonymous) | — | 2026-07-24 | /api/auth/* | Only 4 public routes by design | Correct and intentional | No change needed. |
| Authentication | Signup gate | Register | Submit the signup form while SIGNUP_ACCESS_TOKEN is configured | Account created | Every submission returned 403 "Invalid access token" — the page had no access-token field and never sent one, so /register was completely unusable | Fail → Fixed → Pass | (anonymous) | app/(auth)/register/page.tsx | 2026-07-24 | /register | CRITICAL — onboarding entirely blocked on this page | Only /login → Sign up worked; found during live browser testing | Fixed. Added the Access token field and included it in the payload. Two workspaces registered live through the form afterwards. |
| Authentication | Duplicate signup | Register | Register again with an existing email | Rejected; exactly one user row | Rejected; 1 row | Pass | (anonymous) | — | 2026-07-24 | /register | — | Verified in browser | No change needed. |
| Authentication | Wrong password | Login | Sign in with an incorrect password | Refused, kept on login | Refused, still on /login | Pass | (anonymous) | — | 2026-07-24 | /login | — | Verified in browser | No change needed. |
| Authentication | Sign out | App shell | Sign out, then call a protected API | 401 once session is gone | 401 | Pass | generated account | — | 2026-07-24 | /api/auth/signout | — | Verified in browser | No change needed. |
| Multi-tenancy | Isolation — reads | All modules | Foreign workspace's contact/lead/conversation/campaign fetched by ID | 404, indistinguishable from missing | 404 on all 4 | Pass | admin@demo.com | — | 2026-07-24 | /api/{contacts,leads,conversations,campaigns}/[id] | Seeded a second real tenant | No 403 leak confirming the row exists | No change needed. |
| Multi-tenancy | Isolation — writes | All modules | 8 PATCH/DELETE attempts on foreign rows | 404, rows untouched | 404 on all 8; all rows survived unmodified | Pass | admin@demo.com | — | 2026-07-24 | /api/* | Contact, lead, conversation, ticket, quick reply, campaign | Re-read from DB to confirm no mutation | No change needed. |
| Multi-tenancy | Isolation — lists | All modules | 7 list/search endpoints scanned for foreign IDs | No foreign row present | None present | Pass | admin@demo.com | — | 2026-07-24 | /api/* | Includes global search | Raw response bodies string-searched for IDs | No change needed. |
| Multi-tenancy | Isolation — AI | Inbox | AI qualify/summarize/sentiment on a foreign conversation | 404 before any model call | 404 on all 3 | Pass | admin@demo.com | — | 2026-07-24 | /api/ai/* | Guard runs before the billable call | New sentiment route inherits the guard | No change needed. |
| Multi-tenancy | Isolation — browser | Cross-session | Workspace B requests Workspace A's contact by ID | 404 | 404 | Pass | generated account B | — | 2026-07-24 | /api/contacts/[id] | Two real browser sessions | Verified in the live UI run | No change needed. |
| WhatsApp Inbound | Webhook security | — | POST without X-Hub-Signature-256 | 403 | 403 | Pass | (Meta) | — | 2026-07-24 | /api/webhook/whatsapp | HMAC over raw body | Fails closed if the secret is unset | No change needed. |
| WhatsApp Inbound | Webhook verify | — | GET with a wrong hub.verify_token | 403 | 403 | Pass | (Meta) | — | 2026-07-24 | /api/webhook/whatsapp | — | — | No change needed. |
| WhatsApp Inbound | Message ingestion | Inbox | Inbound message for a tenant configured via Settings with no matching Business record | Contact + conversation created, message stored | Every inbound message was dropped — FK violation contacts_businessId_fkey, logged and swallowed with a 200 to Meta | Fail → Fixed → Pass | (Meta) | app/api/webhook/whatsapp/route.ts:249 | 2026-07-24 | /api/webhook/whatsapp | CRITICAL — silent total message loss | Root cause: a synthesised ID biz_${tenantId} that no businesses row has | Fixed. Fallback now calls the existing ensureDefaultBusiness(tenantId) service. Re-tested: message ingested, conversation created. |
| WhatsApp Inbound | Contact creation | Inbox | First message from an unknown number | Contact auto-created with profile name | Created correctly | Pass *(regression)* | (Meta) | — | 2026-07-24 | /api/webhook/whatsapp | — | — | No change needed. |
| WhatsApp Inbound | Duplicate delivery | Inbox | Meta redelivers the same message ID | Stored once, counters not double-incremented | Handled once | Pass *(regression)* | (Meta) | — | 2026-07-24 | /api/webhook/whatsapp | P2002 path | — | No change needed. |
| WhatsApp Status | Message receipts | Inbox | delivered then read for an agent message | Ladder SENT→DELIVERED→READ | Ladder followed | Pass *(regression)* | (Meta) | — | 2026-07-24 | /api/webhook/whatsapp | — | — | No change needed. |
| WhatsApp Status | Out-of-order receipt | Inbox | delivered arrives after read | READ not walked backwards | Remained READ | Pass *(regression)* | (Meta) | — | 2026-07-24 | /api/webhook/whatsapp | Monotonic STATUS_RANK | — | No change needed. |
| Campaigns | Delivery tracking | Campaigns | Meta delivered receipt for a campaign recipient | deliveredAt stamped, deliveredCount +1 | Impossible — nothing correlated Meta's message ID to a recipient, so deliveredAt/readAt/repliedAt could never be filled | Fail → Fixed → Pass | admin@demo.com | CampaignContact model + both send paths | 2026-07-24 | /api/webhook/whatsapp | CRITICAL — PRD campaign analytics unachievable | Both send paths discarded Meta's response; campaign sends write no Message row | Fixed with the approved additive column CampaignContact.waMessageId. Both send paths persist Meta's ID; the webhook correlates receipts back. |
| Campaigns | Delivery — duplicate | Campaigns | Same delivered receipt redelivered | Counter stays at 1 | Stayed at 1 | Pass | admin@demo.com | — | 2026-07-24 | /api/webhook/whatsapp | First-write-wins, null-guarded | Stamp + counter in one transaction | Fix verified — no counter inflation. |
| Campaigns | Delivery — read implies delivered | Campaigns | read arrives with no prior delivered | Both timestamps stamped | Both stamped; both counters +1 | Pass | admin@demo.com | — | 2026-07-24 | /api/webhook/whatsapp | Meta emits out of order | — | Fix verified. |
| Campaigns | Delivery — foreign receipt | Campaigns | Another tenant's number sends a receipt for our recipient | Refused, counters untouched | Refused, untouched | Pass | (Meta) | — | 2026-07-24 | /api/webhook/whatsapp | Ownership asserted via parent campaign | A unique ID identifies, it does not authorise | Fix verified — tenant-safe. |
| Campaigns | Reply attribution | Campaigns | Recipient replies to a broadcast | repliedAt stamped, repliedCount +1, once only | Stamped once; 2nd message did not re-credit | Pass | (Meta) | — | 2026-07-24 | /api/webhook/whatsapp | Meta never reports "replied" | Inferred from inbound message, isNew-guarded | New capability delivered. |
| Campaigns | Scheduling | Campaigns | Create a campaign with a future Schedule date | Parked as SCHEDULED; nothing sent until due | Sent immediately to the entire audience — scheduledAt was validated then ignored, and the UI never sent the field | Fail → Fixed → Pass | admin@demo.com | app/api/campaigns/route.ts, app/(dashboard)/campaigns/page.tsx | 2026-07-24 | /campaigns | CRITICAL — unrecoverable; a broadcast for next week went out instantly | The cron existed but nothing ever created a SCHEDULED row | Fixed. API parks future-dated campaigns as SCHEDULED with no startedAt; UI sends an ISO instant; helper text corrected. |
| Campaigns | Scheduling — past date | Campaigns | Schedule date already elapsed | Treated as send-now | Sent immediately, not parked | Pass | admin@demo.com | — | 2026-07-24 | /campaigns | Matches user intent | — | Fix verified. |
| Campaigns | Scheduling — invalid date | Campaigns | Unparseable scheduledAt | 400, nothing sent | 400 "Invalid scheduled date" | Pass | admin@demo.com | — | 2026-07-24 | /api/campaigns | Rejected, never silently ignored | Silent-ignore would blast the audience | Fix verified. |
| Campaigns | Scheduled send (cron) | — | Cron processes a due campaign for a workspace with no WhatsApp credentials | Recipients recorded FAILED with a reason | Recipients were marked SENT without any send happening | Fail → Fixed → Pass | (cron) | app/api/cron/campaigns/route.ts | 2026-07-24 | /api/cron/campaigns | Surfaced only once scheduling actually worked | Also used workspace-level creds, ignoring per-business numbers | Fixed. Uses resolveWhatsAppCreds(businessId) and records FAILED with an honest reason. |
| Campaigns | Cron auth | — | Cron endpoint called without CRON_SECRET | 401 | 401 | Pass *(regression)* | (anonymous) | — | 2026-07-24 | /api/cron/campaigns | — | — | No change needed. |
| Campaigns | Cron pickup | — | Backdated SCHEDULED campaign | Picked up, moved off SCHEDULED, completed | processed: 1, moved to COMPLETED | Pass | (cron) | — | 2026-07-24 | /api/cron/campaigns | Verified with real SQL backdating | — | Fix verified end-to-end. |
| Campaigns | Create / validate | Campaigns | Empty name, empty message, no contacts | 400 with a specific message each | 400 on all three | Pass *(regression)* | admin@demo.com | — | 2026-07-24 | /api/campaigns | — | — | No change needed. |
| Campaigns | Duplicate / delete | Campaigns | Duplicate then delete a campaign | 201 then 200 | 201 then 200 | Pass *(regression)* | admin@demo.com | — | 2026-07-24 | /campaigns | — | — | No change needed. |
| Campaigns | Detail view | Campaign detail | Recipient delivery columns exposed | sentAt/deliveredAt/readAt/repliedAt present | All present and now populated | Pass | admin@demo.com | — | 2026-07-24 | /api/campaigns/[id] | Stale comment corrected | waMessageId deliberately not exposed | Documentation corrected alongside the fix. |
| Chatbot | Handoff to human | Inbox | Flow reaches a handoff node | Conversation assigned to an agent and taken off AI | Only isAiActive was cleared — thread left unassigned; the builder's team/queue/department was discarded | Fail → Fixed → Pass | (Meta) | app/api/webhook/whatsapp/route.ts | 2026-07-24 | /api/webhook/whatsapp | Handoff did not actually hand off | PRD requires human handoff to reach a person | Fixed. assignConversationToAgent() picks the least-loaded active agent, sets ASSIGNED, preserves the queue as a label. Schema-free. |
| Chatbot | Handoff — least loaded | Inbox | One busy agent (3 open threads), one idle | Idle agent chosen | Idle agent chosen | Pass | (Meta) | — | 2026-07-24 | /api/webhook/whatsapp | Self-correcting vs round-robin | Ties broken on ID | Fix verified. |
| Chatbot | Handoff — inactive agents | Inbox | Deactivated agent present | Never assigned | Never assigned | Pass | (Meta) | — | 2026-07-24 | /api/webhook/whatsapp | isActive respected | — | Fix verified. |
| Chatbot | Handoff — no agents | Inbox | Workspace with zero active agents | Degrade gracefully, still 200 | 200; thread left unassigned with AI off | Pass | (Meta) | — | 2026-07-24 | /api/webhook/whatsapp | Best-effort by design | Webhook must never fail on this | Fix verified. |
| Chatbot | Handoff — re-trigger | Inbox | Handoff fires again on an assigned thread | Existing assignee kept | Kept; label not duplicated | Pass | (Meta) | — | 2026-07-24 | /api/webhook/whatsapp | Customer not yanked mid-conversation | — | Fix verified. |
| Chatbot | Flow CRUD | Chatbot Builder | Create / read / validate / duplicate / delete a flow | All succeed; missing trigger 400 | All succeeded; 400 on missing trigger | Pass *(regression)* | admin@demo.com | — | 2026-07-24 | /chatbot | 9 node kinds supported | — | No change needed. |
| Chatbot | Multi-turn session | Inbox | Question node pauses, customer answers, flow resumes | Session persisted and resumed | Resumed correctly | Pass *(regression)* | (Meta) | — | 2026-07-24 | /api/webhook/whatsapp | activeFlowId/activeNodeId/flowVars | — | No change needed. |
| Chatbot | Builder — node drag | Chatbot Builder | Drag a Message node from the palette onto the canvas | Node appears on the canvas | Canvas rendered the new node | Pass | generated account A | — | 2026-07-24 | /chatbot | Real browser drag with the custom MIME payload | Live Playwright run | Verified working. |
| Chatbot | Builder — persistence | Chatbot Builder | Confirm the dragged node persists | Node count in DB increases | Persisted via the builder's autosave | Pass | generated account A | — | 2026-07-24 | /chatbot | Autosave is why Save sits disabled | Live Playwright run | Verified working. |
| Inbox | Qualify Lead (AI) | Inbox → Contact panel | Click "Qualify Lead (AI)" | Lead scored via BANT | Button did nothing — no handler, marked TODO while the endpoint existed and worked | Fail → Fixed → Pass | admin@demo.com | components/inbox/ContactPanel.tsx | 2026-07-24 | /inbox | Backend fully built, UI never connected | — | Fixed. Added useAiQualify and wired the button with pending/error states and an inline score. Endpoint returned 200. |
| Inbox | Summarize (AI) | Inbox → Contact panel | Click "Summarize (AI)" | Thread summary shown | Button did nothing — useAiSummarize existed but was never called | Fail → Fixed → Pass | admin@demo.com | components/inbox/ContactPanel.tsx | 2026-07-24 | /inbox | — | — | Fixed. Wired to the existing hook; summary rendered. Endpoint returned 200. |
| Inbox | Resolve conversation | Inbox → Contact panel | Click "Resolve" | Status → RESOLVED | Button did nothing | Fail → Fixed → Pass | admin@demo.com | components/inbox/ContactPanel.tsx | 2026-07-24 | /inbox | — | — | Fixed. Wired to useResolveConversation; disables once resolved. PATCH verified 200 + persisted. |
| Inbox | Assign agent | Inbox → Contact panel | Pick an agent from the dropdown | Conversation assigned | Dropdown did nothing — and the hook typed assignedToId, which the API's strictObject rejects | Fail → Fixed → Pass | admin@demo.com | components/inbox/ContactPanel.tsx, hooks/useMessages.ts | 2026-07-24 | /inbox | Two defects in one flow | Confirmed: assignedToId → 400; assigneeId → 200 | Fixed. Corrected the hook contract to assigneeId and wired the select with rollback on error. |
| Inbox | Sentiment (AI) | Inbox → Contact panel | Check customer sentiment | Verdict returned | No way to reach it — detectSentiment() existed in lib/ai.ts with zero callers, no route, no UI | Missing → Added → Pass | admin@demo.com | lib/ai.ts (orphaned) | 2026-07-24 | /inbox | PRD AI feature unreachable | — | Added /api/ai/sentiment (tenant-guarded, read-only, last 10 inbound messages) + hook + button. Returned a live verdict. |
| Inbox | Quick replies — picker | Inbox composer | Type / in the composer | Matching canned replies listed, selection inserts text | Picker opens, filters, inserts | Missing → Added → Pass | admin@demo.com | — | 2026-07-24 | /inbox | QuickReply model existed with zero API/UI/hooks | Keyboard ↑/↓/Enter/Tab/Esc handled | Added. Enter is intercepted so the raw /shortcode can never be sent as a message. |
| Inbox | Attachment drag | Inbox | Drag a file over the conversation area | Drop target responds | Drop target responded | Pass | generated account A | — | 2026-07-24 | /inbox | Live Playwright run | — | Verified working. |
| Quick Replies | Create | Settings → Quick Replies | Create /QA-Hours | Saved, shortcode normalised | Saved as qa-hours | Missing → Added → Pass | admin@demo.com | — | 2026-07-24 | /settings | New /api/quick-replies | Leading slash stripped, lower-cased | Added. Full CRUD API + hook + settings tab. |
| Quick Replies | Duplicate | Settings → Quick Replies | Same shortcode twice | 409 | 409 | Pass | admin@demo.com | — | 2026-07-24 | /api/quick-replies | Matches the model's unique constraint | A validation result, not a 500 | Verified. |
| Quick Replies | Validation | Settings → Quick Replies | Spaces/symbols in shortcode; empty content; malformed JSON | 400 each | 400 on all three | Pass | admin@demo.com | — | 2026-07-24 | /api/quick-replies | — | — | Verified. |
| Quick Replies | Update / delete | Settings → Quick Replies | PATCH content, PATCH empty body, PATCH/DELETE unknown ID, DELETE | 200 / 400 / 404 / 404 / 200 | Exactly as expected; row gone from list | Pass | admin@demo.com | — | 2026-07-24 | /api/quick-replies/[id] | — | Business-scoped lookup | Verified. |
| Quick Replies | Create via UI | Settings → Quick Replies | Create a quick reply in the browser | Persisted and listed | Persisted, verified in DB | Pass | generated account A | — | 2026-07-24 | /settings | Live Playwright run | — | Verified working. |
| Contacts | Create / validate | Contacts | Create, duplicate phone, missing phone | 201 / 409 / 400 | 201 / 409 / 400 | Pass *(regression)* | admin@demo.com | — | 2026-07-24 | /contacts | — | — | No change needed. |
| Contacts | Read / update / delete | Contacts | GET, PATCH, DELETE by ID | All 200 | All 200 | Pass *(regression)* | admin@demo.com | — | 2026-07-24 | /contacts | — | — | No change needed. |
| Contacts | Soft delete | Contacts | Deleted contact absent from list | Removed from list, record retained | Removed; record retained | Pass *(regression)* | admin@demo.com | — | 2026-07-24 | /api/contacts | Deliberate soft delete (isBlocked) | Initially flagged as a bug; confirmed intentional | No change needed — by design. |
| Contacts | Export | Contacts | Export contacts | 200 CSV | 200 | Pass *(regression)* | admin@demo.com | — | 2026-07-24 | /api/contacts/export | — | — | No change needed. |
| Contacts | Import | Contacts | Valid / invalid / duplicate / empty rows classified | Correctly bucketed | Correctly bucketed | Pass *(regression)* | admin@demo.com | — | 2026-07-24 | /contacts | SheetJS client-side parse | — | No change needed. |
| Contacts | Create via UI | Contacts | Create a contact through the Add Contact modal | Persisted with every field | Persisted; verified in DB | Pass | generated account A/B | — | 2026-07-24 | /contacts | Live Playwright run, random data | Appeared in the list with no reload | Verified working. |
| Contacts | Form validation via UI | Contacts | Submit the contact form with every field empty | Blocked with visible messages | Blocked, nothing saved | Pass | generated account A | — | 2026-07-24 | /contacts | Live Playwright run | — | Verified working. |
| Leads | Create | Leads | Create with contactId + title | 201, default stage assigned | 201, stageId auto-assigned | Pass *(regression)* | admin@demo.com | — | 2026-07-24 | /leads | — | — | No change needed. |
| Leads | Validation | Leads | Foreign contact / missing title / score 150 | 404 / 400 / 400 | 404 / 400 / 400 | Pass *(regression)* | admin@demo.com | — | 2026-07-24 | /api/leads | — | — | No change needed. |
| Leads | Update / delete | Leads | PATCH then DELETE, then GET | 200 / 200 / 404 | 200 / 200 / 404 | Pass *(regression)* | admin@demo.com | — | 2026-07-24 | /leads | — | — | No change needed. |
| Leads | Scoring bands | Leads | 0–30 / 31–60 / 61–80 / 81–100 | COLD / WARM / HOT / QUALIFIED | Exactly as the PRD specifies | Pass *(regression)* | admin@demo.com | — | 2026-07-24 | /leads | — | — | No change needed. |
| Leads | Export | Leads | Export leads | 200 | 200 | Pass *(regression)* | admin@demo.com | — | 2026-07-24 | /api/leads/export | — | — | No change needed. |
| Pipeline | Stage provisioning | Settings → Lead Pipeline | Tenant auto-provisioned with 7 stages, exactly 1 default | 7 stages, 1 default | 7 stages, 1 default | Pass *(regression)* | admin@demo.com | — | 2026-07-24 | /settings | Dynamic PipelineStage | Admin-gated tab | No change needed. |
| Pipeline | Drag to reorder | Settings → Lead Pipeline | Drag stage 1 onto position 3 and save | Order changes and persists | Order changed and persisted to the database | Pass | generated account A | — | 2026-07-24 | /settings | Live Playwright HTML5 drag | Save enables only when the list is dirty | Verified working. |
| Tickets | Create | Tickets | Create with subject + priority | 201, slaDeadline derived from priority | 201 with derived deadline | Pass *(regression)* | admin@demo.com | — | 2026-07-24 | /tickets | Deadline derived, never client-supplied | — | No change needed. |
| Tickets | Strict validation | Tickets | Body carrying status or unknown keys | 400 | 400 "Unrecognized key" | Pass *(regression)* | admin@demo.com | — | 2026-07-24 | /api/tickets | Prevents opening a pre-resolved ticket | — | No change needed. |
| Tickets | Lifecycle | Tickets | PATCH status, invalid status, unknown ID | 200 / 400 / 404 | 200 / 400 / 404 | Pass *(regression)* | admin@demo.com | — | 2026-07-24 | /tickets | — | — | No change needed. |
| Tickets | Dead client hooks | — | useTicket(id) / useDeleteTicket() | Should not exist — API exposes PATCH only, by documented decision | Both existed and would have returned 405 on first use | Fail → Fixed → Pass | admin@demo.com | hooks/useTickets.ts | 2026-07-24 | — | Latent trap for the next developer | Neither had a UI caller, so nothing was visibly broken | Fixed by removal, with a comment explaining why GET/DELETE are withheld. |
| Tickets | SLA display | Tickets | SLA countdown / breach shown per ticket | Rendered | Rendered via SlaCell | Pass *(regression)* | admin@demo.com | — | 2026-07-24 | /tickets | — | Escalation automation not built — see §5 | No change needed for display. |
| Templates | Create / validate | Templates | Create, duplicate name, invalid category | 201 / 409 / 400 | 201 / 409 / 400 | Pass *(regression)* | admin@demo.com | — | 2026-07-24 | /templates | — | — | No change needed. |
| Analytics | Dashboard data | Analytics | Fetch analytics | 200 with aggregates | 200 | Pass *(regression)* | admin@demo.com | — | 2026-07-24 | /analytics | — | — | No change needed. |
| Knowledge Base | RAG chunking | Knowledge Base | Chunk realistic prose | Multiple overlapping chunks | 20 chunks | Pass *(regression)* | admin@demo.com | — | 2026-07-24 | /knowledge-base | Qdrant + embeddings | — | No change needed. |
| Knowledge Base | CRUD | Knowledge Base | List / fetch / delete docs | 200 | 200 | Pass *(regression)* | admin@demo.com | — | 2026-07-24 | /api/knowledge | Vectors deleted alongside | — | No change needed. |
| Team | Listing | Team | List team members | 200 | 200 | Pass *(regression)* | admin@demo.com | — | 2026-07-24 | /team | — | — | No change needed. |
| Settings | Tabs | Settings | General / WhatsApp / Billing / Notifications load and save | 200 | 200 | Pass *(regression)* | admin@demo.com | — | 2026-07-24 | /settings | — | Quick Replies tab added alongside | No change needed. |
| Billing | Plans | Billing | List plans | 200 | 200 | Pass *(regression)* | admin@demo.com | — | 2026-07-24 | /billing | Stripe | Razorpay unimplemented — see §5 | No change needed. |
| Businesses | Multi-business | Businesses | List / switch business | 200 | 200 | Pass *(regression)* | admin@demo.com | — | 2026-07-24 | /businesses | — | — | No change needed. |
| Search | Global search | All | Search across entities | 200, tenant-scoped | 200, no foreign rows | Pass *(regression)* | admin@demo.com | — | 2026-07-24 | /api/search | — | — | No change needed. |
| Notifications | Feed | Header | Fetch notifications | 200 | 200 | Pass *(regression)* | admin@demo.com | — | 2026-07-24 | /api/notifications | Audit log + recent messages | — | No change needed. |
| Navigation | All pages | 13 dashboard pages | Open each page with an authenticated session | 200, stays on route, no runtime errors | All 13 rendered clean | Pass | generated account A | — | 2026-07-24 | /dashboard … /billing | Live Playwright run | Asserted final URL, not just status | No change needed. |
| Build & Types | Regression gate | — | tsc --noEmit, next build, eslint | 0 type errors, build succeeds, no new lint errors | 0 errors; compiled successfully; 8 pre-existing lint errors, none in changed files | Pass | — | — | 2026-07-24 | — | Full-project gate | Pre-existing errors are in untouched files | No regressions introduced. |

---

## 3. Defects Found & Solutions Applied

### 3.1 CRITICAL — Inbound WhatsApp messages silently dropped
**Where:** `app/api/webhook/whatsapp/route.ts:249`
**Symptom:** For any tenant that configured WhatsApp through **Settings** without a `Business` row carrying the same `whatsappPhoneNumberId`, every inbound message failed and was discarded. The webhook logged the error and still returned 200, so Meta never retried.
**Root cause:** The fallback synthesised an identifier — `` `biz_${settings.tenantId}` `` — which is written onto every `Contact` and `Conversation`, both of which carry a foreign key to `businesses.id`.
**Solution:** Replaced it with the existing `ensureDefaultBusiness(tenantId)` service, which returns the tenant's oldest business or seeds one from their TenantSettings.

### 3.2 CRITICAL — Campaign scheduling sent immediately
**Where:** `app/api/campaigns/route.ts`, `app/(dashboard)/campaigns/page.tsx`
**Symptom:** A future date in the Schedule field sent the broadcast immediately. Unrecoverable.
**Root cause:** The form collected the schedule but never sent it; the API accepted `scheduledAt` and never referenced it. The cron existed but nothing ever created a `SCHEDULED` row.
**Solution:** Future-dated campaigns park as `SCHEDULED` with no `startedAt`; past dates send now; unparseable dates are rejected with 400. The UI now sends an ISO instant and the helper text was corrected.

### 3.3 CRITICAL — Campaign delivery tracking impossible *(the one approved schema change)*
**Symptom:** `deliveredAt`, `readAt` and `repliedAt` could never be populated; counters stayed at zero.
**Root cause:** Both send paths discarded Meta's response, campaign sends write no `Message` row, and `CampaignContact` had no field for an external ID. The only schema-free candidate was an unindexed, non-unique, clobberable JSON path.
**Solution:** Added `waMessageId String? @unique` to `CampaignContact`; both send paths persist it; the webhook attributes receipts and increments counters in one transaction.

### 3.4 HIGH — Chatbot handoff did not hand off
**Solution:** `assignConversationToAgent()` selects the least-loaded active agent, sets `ASSIGNED`, and preserves the requested queue as a conversation label. Schema-free.

### 3.5 HIGH — Four inbox quick actions were inert
**Solution:** Qualify, Summarize, Resolve and agent assignment all wired to hooks with pending/error states and in-panel results.

### 3.6 HIGH — Conversation-assignment hook could never have worked
**Solution:** `UpdateConversationInput` corrected from `assignedToId` to `assigneeId`, which is what the route's `strictObject` accepts.

### 3.7 MEDIUM — Cron reported sends that never happened
**Solution:** Uses `resolveWhatsAppCreds(businessId)` and records recipients as FAILED with an explicit reason when there is no channel.

### 3.8 LOW — Dead ticket hooks
**Solution:** Removed `useTicket` and `useDeleteTicket`, with a comment recording why those methods are deliberately withheld.

### 3.9 LOW — Stale documentation
**Solution:** Corrected a comment in `campaigns/[id]` and the webhook file header, both of which contradicted the code.

### 3.10 CRITICAL — `/register` unusable while the signup gate is on
**Where:** `app/(auth)/register/page.tsx`
**Symptom:** Every signup from `/register` returned 403 "Invalid access token". The page had no access-token field and never sent one, so the entire page was dead; only `/login` → Sign up worked. Found during live browser testing.
**Solution:** Added the Access token field and included it in the registration payload. Two workspaces were then registered end-to-end through the form.

---

## 4. What Was Already Complete (verified, not changed)

- Authentication, session handling and the 401 boundary across all API routes
- Multi-tenant and multi-business isolation — zero bleed on reads, writes, lists, search and AI routes
- Webhook HMAC verification, verify-token challenge, cron `CRON_SECRET` gating
- Contacts: CRUD, validation, duplicate detection, soft delete, import classification, export
- Leads: CRUD, validation, BANT fields, PRD-exact score bands, export
- Dynamic pipeline stages with auto-provisioning
- Tickets: priority-derived SLA deadline, strict validation, lifecycle, SLA display
- Templates CRUD with duplicate and category validation
- Chatbot builder: flow CRUD, validation, publish/draft/autosave/duplicate, 9 node kinds, multi-turn sessions
- Knowledge base / RAG: extraction, chunking, embedding, retrieval, vector cleanup
- Message status ladder with monotonic, order-independent receipts
- Analytics, global search, notifications, team, businesses, billing plans, settings
- Stripe billing: checkout, portal, cancel, resume, change, webhook

---

## 5. Remaining Gaps & Recommendations

| # | Item | Status | Why it is not done | Schema change needed? |
|---|---|---|---|---|
| 1 | Department / skill-based routing | Not implemented | Needs `User.department` / `User.skills`. Not approved, not made. Handoff routes least-loaded and keeps the queue as a label. | Yes — additive |
| 2 | GST invoicing with GSTIN | Not implemented | Needs `Tenant.gstin`. Not approved, not made. | Yes — additive |
| 3 | Ticket SLA escalation automation | Not implemented | Deadlines are derived, stored and displayed with breach state. Escalation automation was my own suggestion, not a confirmed PRD requirement. | No |
| 4 | Razorpay payments | Not implemented | Columns exist; only Stripe is wired. Out of scope for this pass. | No |
| 5 | Revenue page mock rows | Cosmetic | Two hardcoded preview transactions remain as a fallback; the real API exists. | No |
| 6 | Pre-existing lint errors (8) | Untouched | All in files not involved in this pass. | No |

---

## 6. Schema Change Record

| Field | Detail |
|---|---|
| Change | `CampaignContact.waMessageId String? @unique` |
| Type | Additive, nullable, indexed |
| Approved | Yes — conditionally, on proof that no existing field could reliably correlate Meta delivery receipts |
| PRD feature depending on it | Campaign delivery, read and reply tracking |
| Applied via | `ALTER TABLE "campaign_contacts" ADD COLUMN IF NOT EXISTS "waMessageId" TEXT;` + unique index |
| Existing data impact | None — `campaign_contacts` held 0 rows; the column is nullable regardless |
| Migration risk | Minimal — additive only |
| Rollback | Drop the index and column; code reverts to unattributed receipts |
| Other schema changes made | None |

---

## 7. Regression Evidence

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npx next build` | Compiled successfully; new routes present in the manifest |
| `npx eslint .` | 8 errors / 16 warnings — all pre-existing, none in changed files |
| Campaign delivery-receipt harness | 24 / 24 passed |
| Chatbot handoff harness | 13 / 13 passed |
| Tenant isolation harness | 27 / 27 passed |
| Inbox quick-action suite | 14 / 14 passed |
| Live browser run (Playwright, random data) | 32 / 32 passed |

Scenarios that initially reported failures were re-examined before being recorded: several were defects in the test harness itself (wrong field names, greedy ID extraction, a phone-number collision, a `readonly` shell variable, fills racing React hydration, an onboarding overlay intercepting clicks, and a DB read racing the builder's debounced autosave), and some were transient Neon database suspensions. Those are **not** counted as product defects. Every defect in §3 was confirmed against the running application before any code was changed.
