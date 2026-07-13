# WhatsApp CRM & Lead Management SaaS

AI-Powered WhatsApp CRM, Automation & Lead Management platform — Next.js 16 full-stack, Neon PostgreSQL, Groq Llama AI.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) — frontend + backend in one |
| Database | PostgreSQL on Neon (serverless, no setup needed) |
| ORM | Prisma v7 |
| Auth | NextAuth v5 — credentials + JWT (DONE) |
| AI | Groq — Llama 3.3 70B |
| Real-time | Pusher (WebSocket for live inbox) |
| Validation | Zod |
| UI | Tailwind CSS v4 + Lucide Icons |
| State / Data | TanStack React Query v5 |

---

## Getting Started

### Prerequisites
- Node.js 20+
- Get the `.env` file from team lead (never commit it)

### Setup

```bash
git clone <repo-url>
cd whatsapp_lead
npm install
npm run db:generate
npm run dev
```

Open http://localhost:3000

### Seed Demo Data

```bash
npm run db:seed
```

Demo login: `admin@demo.com` / `Demo@1234`

---

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL — already set, do not change |
| `AUTH_SECRET` | NextAuth JWT secret |
| `GROQ_API_KEY` | Groq AI key — already set |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp number ID (per tenant in DB) |
| `WHATSAPP_VERIFY_TOKEN` | Webhook verification token |
| `PUSHER_APP_ID` / `PUSHER_KEY` / `PUSHER_SECRET` | Pusher real-time |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` |

---

## Project Structure

```
whatsapp_lead/
├── app/
│   ├── (marketing)/        # Landing pages — AMAN
│   ├── (auth)/             # Login / Register — HEMANT (UI) + SHALMON (logic)
│   ├── (dashboard)/        # Workspace UI — HEMANT (UI) + GAURANSH (APIs)
│   ├── (admin)/            # Super-admin panel — HEMANT (UI) + SHALMON (APIs)
│   └── api/
│       ├── auth/           # NextAuth + register — SHALMON ✅ DONE
│       ├── contacts/       # CRM CRUD — SHALMON
│       ├── conversations/  # Inbox — GAURANSH
│       ├── messages/       # Send WA message — GAURANSH
│       ├── leads/          # Lead pipeline — GAURANSH
│       ├── campaigns/      # Bulk send — GAURANSH
│       ├── tickets/        # Support — GAURANSH
│       ├── templates/      # WA templates — GAURANSH
│       ├── knowledge/      # KB docs — GAURANSH
│       ├── analytics/      # KPIs — GAURANSH
│       ├── ai/             # AI endpoints — GAURANSH
│       ├── webhook/        # WA webhook — GAURANSH
│       └── admin/          # Platform admin — SHALMON
├── lib/
│   ├── auth.ts             # NextAuth config ✅ DONE
│   ├── prisma.ts           # DB client ✅ DONE
│   ├── ai.ts               # Groq helpers ✅ DONE
│   ├── whatsapp.ts         # WA Cloud API client
│   └── validators/         # Zod schemas ✅ DONE
├── hooks/                  # React Query hooks (Hemant uses these)
├── types/                  # Shared TypeScript types
├── components/             # UI components per intern
└── prisma/
    ├── schema.prisma       # 16-model schema ✅ DONE
    └── seed.ts             # Plans + demo data ✅ DONE
```

---

## Intern Branches

| Intern | Branch | Work Area |
|---|---|---|
| Shalmon | `feature/shalmon-auth-crm` | Auth APIs, Contacts API, Admin APIs |
| Aman | `feature/aman-landing-marketing` | All marketing/landing pages |
| Hemant | `feature/hemant-dashboard-inbox` | All dashboard + admin UI |
| Gauransh | `feature/gauransh-whatsapp-leads` | WhatsApp, AI, Leads, Campaigns |

```bash
# Start every session
git checkout feature/<your-name>-...
git fetch origin && git rebase origin/master
```

---

## ✅ Task Checklists

---

### 🔵 Shalmon — Auth, CRM & Admin APIs

**Branch:** `feature/shalmon-auth-crm`

> Auth and registration are already done. Focus on contacts CRUD and admin APIs.

#### Contacts API
- [ ] `GET /api/contacts` — list contacts for tenant with pagination (`page`, `limit`)
  - Filter by `search` (name or phone ILIKE)
  - Filter by `tagId`
  - Return: `{ data: Contact[], pagination: { page, limit, total } }`
- [ ] `POST /api/contacts` — create new contact
  - Validate with `createContactSchema` from `lib/validators/contact.ts`
  - Check: no duplicate phone for same `tenantId`
  - Return created contact
- [ ] `GET /api/contacts/[id]` — single contact with tags + linked lead + conversation count
- [ ] `PATCH /api/contacts/[id]` — partial update (name, email, company, notes, tags)
- [ ] `DELETE /api/contacts/[id]` — soft delete: set `isActive: false`
- [ ] Complete `hooks/useContacts.ts` — add `useCreateContact`, `useUpdateContact`, `useDeleteContact` mutations

#### Admin APIs
- [ ] `GET /api/admin/tenants` — list all tenants (name, plan, userCount, isActive, joinedAt)
  - Support `search`, `isActive`, `planId` query params
- [ ] `PATCH /api/admin/tenants/[id]` — suspend (`isActive: false`) or change plan
- [ ] `GET /api/admin/stats` — platform-wide KPIs:
  - `totalTenants`, `activeTenants`, `totalUsers`, `totalMessages`, `MRR`
  - `signupsLast30Days: [{ date, count }]` for chart
- [ ] `GET /api/admin/plans` — list plans with subscriber count (already has skeleton)

#### Rules for every Prisma query:
```typescript
// ALWAYS include this — never skip
where: { tenantId: session.user.tenantId, ... }
```

---

### 🟢 Aman — Landing Pages & Marketing UI

**Branch:** `feature/aman-landing-marketing`

> All files are in `app/(marketing)/`. Build full UI — no backend work needed.

#### Navbar (`components/marketing/Navbar.tsx`)
- [ ] Logo on left (text "WhatsCRM" in purple)
- [ ] Nav links: Features, Pricing, Industries, About, Blog
- [ ] Right side: Login button + "Start Free Trial" button (purple, solid)
- [ ] Mobile: hamburger menu that opens a slide-down nav
- [ ] Sticky on scroll (add `sticky top-0 z-50 bg-white/95 backdrop-blur`)

#### Homepage (`app/(marketing)/page.tsx`)
- [ ] **Hero section** — Big headline, sub-headline, two CTA buttons, product screenshot/mockup below
- [ ] **Logos strip** — "Trusted by 500+ businesses" with 5-6 fake company logos (just text in gray)
- [ ] **Features grid** — 6 cards: WhatsApp Inbox, AI Auto-Reply, Lead Pipeline, Campaigns, Analytics, Knowledge Base
- [ ] **How it works** — 3 steps with icons: Connect WA → Import Contacts → Start Selling
- [ ] **Testimonials** — 3 cards with name, company, quote, star rating
- [ ] **Pricing preview** — show 3 plan cards (link to /pricing for details)
- [ ] **Final CTA banner** — "Start your free 14-day trial" + button

#### Pricing page (`app/(marketing)/pricing/page.tsx`)
- [ ] Monthly / Annual toggle (annual = 20% off, show strikethrough)
- [ ] 3 plan cards side by side: Starter / Growth / Enterprise
  - Starter: ₹999/mo, 1000 contacts, 5000 msgs, 3 agents
  - Growth: ₹2999/mo, 10000 contacts, 50000 msgs, 10 agents, AI enabled
  - Enterprise: ₹9999/mo, unlimited, white label, dedicated support
- [ ] Feature comparison table below the cards
- [ ] FAQ section (5-6 common questions)

#### Other pages (keep simple, just proper layout + content)
- [ ] `features/page.tsx` — expand on 6 features with screenshots/mockups
- [ ] `contact/page.tsx` — name, email, message form (no API needed, just UI)
- [ ] `about/page.tsx` — company story, team section
- [ ] `industries/page.tsx` — 6 industry cards (Real Estate, EdTech, E-commerce, etc.)
- [ ] `privacy-policy/page.tsx`, `terms/page.tsx`, `refund-policy/page.tsx` — plain text content

#### Footer (`components/marketing/Footer.tsx`)
- [ ] 4 columns: Product links, Company links, Legal links, Social icons
- [ ] Copyright line at bottom

#### Design rules:
- Primary color: `#6C3FC4` (purple)
- Use Tailwind only — no external UI library
- Every page must be mobile responsive (`sm:`, `md:`, `lg:` prefixes)

---

### 🟡 Hemant — Dashboard & Admin UI

**Branch:** `feature/hemant-dashboard-inbox`

> Build all UI. Use React Query hooks from `hooks/` for data. Handle loading and empty states.

#### Dashboard Sidebar (`components/dashboard/Sidebar.tsx`)
- [ ] Logo at top
- [ ] Nav links with Lucide icons:
  - Inbox (MessageSquare), Contacts (Users), Leads (TrendingUp), Campaigns (Megaphone), Analytics (BarChart2), Chatbot (Bot), Tickets (Ticket), Knowledge Base (BookOpen), Team (UserCheck), Settings (Settings)
- [ ] Active link highlight (purple background)
- [ ] Collapse to icon-only on small screens
- [ ] Bottom: user avatar, name, plan badge (Starter/Growth/Enterprise), logout button

#### Dashboard Topbar (`components/dashboard/Topbar.tsx`)
- [ ] Page title (changes per page)
- [ ] Search bar in center
- [ ] Right: notification bell icon, agent status dropdown (Online/Busy/Away)

#### Inbox page (`app/(dashboard)/inbox/page.tsx`) — 3 columns
- [ ] **Column 1 — Conversation list** (w-80, scrollable)
  - Each row: contact avatar (initials), name, last message preview, time, unread count badge
  - Filter tabs: All / Open / Resolved / Mine
  - Click row → loads conversation in col 2
- [ ] **Column 2 — Chat window** (flex-1)
  - Messages as bubbles: incoming = left (gray bg), outgoing = right (green bg)
  - Show time under each bubble
  - Bottom: text input + send button + attach icon
  - "Internal note" toggle (yellow bg for notes)
- [ ] **Column 3 — Contact panel** (w-72)
  - Contact name, phone, avatar
  - Lead stage badge
  - Tags list
  - Quick action buttons: Qualify Lead (AI), Summarize (AI), Resolve
  - Conversation details: created at, assigned agent

#### Contacts page (`app/(dashboard)/contacts/page.tsx`)
- [ ] Search input + tag filter dropdown
- [ ] Table: avatar, name, phone, email, tags, last activity, lead stage, actions
- [ ] "Add Contact" button → modal form (name, phone required)
- [ ] Click row → `/contacts/[id]`

#### Contact detail page (`app/(dashboard)/contacts/[id]/page.tsx`)
- [ ] Header: avatar, name, phone, email, company, tags
- [ ] Tabs: Overview | Conversations | Leads | Activity
- [ ] Edit button → inline edit form

#### Leads page (`app/(dashboard)/leads/page.tsx`) — Kanban board
- [ ] 7 columns: New Lead | Contacted | Qualified | Proposal Sent | Negotiation | Won | Lost
- [ ] Each card shows:
  - Contact name + phone
  - Deal value (₹)
  - Score badge: COLD (blue) / WARM (orange) / HOT (red) / QUALIFIED (green)
  - Assigned agent avatar
  - Days in stage
- [ ] "Add Lead" button on each column
- [ ] Drag cards between columns (use HTML5 draggable attribute)

#### Analytics page (`app/(dashboard)/analytics/page.tsx`)
- [ ] 8 KPI cards in a grid:
  - Total Conversations, Open Conversations, Resolved Today
  - Total Messages, Avg Response Time, Total Leads, Won Deals, Conversion Rate
- [ ] Line chart (Recharts): Messages sent vs received — last 30 days
- [ ] Bar chart (Recharts): Leads by stage
- [ ] Date range picker at top (Last 7d / 30d / 90d)

#### Other dashboard pages (placeholder UI is fine, basic layout)
- [ ] `campaigns/page.tsx` — table of campaigns + "Create Campaign" button
- [ ] `chatbot/page.tsx` — visual flow builder placeholder
- [ ] `tickets/page.tsx` — ticket table with status/priority filters
- [ ] `knowledge-base/page.tsx` — doc list + upload button
- [ ] `ai-settings/page.tsx` — AI toggle, system prompt textarea, auto-reply settings form
- [ ] `team/page.tsx` — agent list table + invite button
- [ ] `settings/page.tsx` — tabs: General | WhatsApp | Billing | Notifications

#### Admin panel pages (dark theme)
- [ ] `(admin)/layout.tsx` — dark sidebar (already scaffolded, make it functional with links)
- [ ] `(admin)/dashboard/page.tsx` — KPI cards + 2 charts (already scaffolded, make it look real)
- [ ] `(admin)/tenants/page.tsx` — complete the table with real columns and filter UI
- [ ] `(admin)/plans/page.tsx` — 3 plan cards with edit modal
- [ ] `(admin)/revenue/page.tsx` — MRR/ARR cards + line chart

#### Component rules:
```typescript
// Use lucide-react for ALL icons
import { MessageSquare, Users, TrendingUp } from "lucide-react";

// Conditional classes
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
const cn = (...c) => twMerge(clsx(c));

// Handle loading state from hooks
const { data, isLoading } = useContacts();
if (isLoading) return <SkeletonLoader />;
```

---

### 🔴 Gauransh — WhatsApp, AI, Leads & Real-time

**Branch:** `feature/gauransh-whatsapp-leads`

> All backend APIs. AI functions in `lib/ai.ts` are already implemented. Focus on the route handlers.

#### WhatsApp Webhook (`app/api/webhook/whatsapp/route.ts`)
- [ ] Parse incoming `WAWebhookPayload` (see `types/index.ts` for the shape)
- [ ] Extract: `from` (phone), `messageId`, `text.body`, `timestamp`, `type`
- [ ] Upsert contact: `prisma.contact.upsert({ where: { phone_tenantId }, create: {...} })`
- [ ] Find or create conversation (`status: "OPEN"`)
- [ ] Save message to DB (`direction: "INBOUND"`, `status: "DELIVERED"`)
- [ ] Call `markMessageAsRead()` from `lib/whatsapp.ts`
- [ ] Broadcast via Pusher: `pusher.trigger("tenant-${tenantId}", "new-message", savedMessage)`
- [ ] If `tenant.settings.aiAutoReply === true`:
  - Fetch last 10 messages for context
  - Call `generateReply(messages, tenant.settings.aiSystemPrompt)` from `lib/ai.ts`
  - Call `sendTextMessage()` → save outbound message → broadcast

#### Send Message (`POST /api/messages`)
- [ ] Body: `{ conversationId, content, type, isNote? }`
- [ ] Validate with `sendMessageSchema`
- [ ] If `isNote`: save with `isNote: true`, no WhatsApp send
- [ ] Else: call `sendTextMessage(phoneNumberId, apiKey, to, content)`
- [ ] Save to DB with `direction: "OUTBOUND"`, `status: "SENT"`
- [ ] Broadcast via Pusher

#### Conversations (`app/api/conversations/`)
- [ ] `GET /api/conversations` — list conversations for tenant
  - Filter: `status` (OPEN/RESOLVED), `assigneeId`
  - Include: last message, unread count, contact name/phone
  - Order by: `updatedAt desc`
- [ ] `GET /api/conversations/[id]` — conversation + messages (paginated, 50 at a time)
- [ ] `PATCH /api/conversations/[id]` — update `status` or `assigneeId`

#### Leads (`app/api/leads/`)
- [ ] `GET /api/leads` — return leads grouped by stage for Kanban:
  ```typescript
  // Return format Hemant's Kanban expects:
  { NEW_LEAD: Lead[], CONTACTED: Lead[], QUALIFIED: Lead[], ... }
  ```
- [ ] `POST /api/leads` — create lead, link to contactId
- [ ] `GET /api/leads/[id]` — lead details + activities timeline
- [ ] `PATCH /api/leads/[id]` — update stage/score/value/assignee
  - If stage changed: create `LeadActivity { type: "STAGE_CHANGED", oldValue, newValue }`
  - Recalculate `scoreLabel` from `score`
- [ ] `DELETE /api/leads/[id]` — soft delete

#### Campaigns (`app/api/campaigns/`)
- [ ] `GET /api/campaigns` — list with stats (sent count, failed count)
- [ ] `POST /api/campaigns`:
  - Body: `{ name, message, contactIds[] }` (simple text message, no template needed for now)
  - Create `Campaign` record + `CampaignContact` rows
  - Loop through contacts, call `sendTextMessage()` for each
  - Update each `CampaignContact.status` to `"SENT"` or `"FAILED"`
  - Mark campaign `status: "COMPLETED"` when loop finishes

#### AI Endpoints (`app/api/ai/`)
- [ ] `POST /api/ai/qualify` — body: `{ conversationId }`
  - Fetch messages, join as text, call `qualifyLead(text)` from `lib/ai.ts`
  - Update lead: `score`, `scoreLabel`, `bantBudget`, `bantAuthority`, `bantNeed`, `bantTimeline`
  - Return `{ score, scoreLabel, bantBudget, bantAuthority, bantNeed, bantTimeline, reasoning }`
- [ ] `POST /api/ai/summarize` — body: `{ conversationId }`
  - Fetch messages, call `summarizeConversation(messages)` from `lib/ai.ts`
  - Return `{ summary: string }`
- [ ] `POST /api/ai/reply` — body: `{ conversationId, systemPrompt? }`
  - Fetch last 10 messages, call `generateReply()`, return `{ reply: string }`

#### Analytics (`GET /api/analytics`)
- [ ] Query params: `period` (7d / 30d / 90d)
- [ ] Return:
  ```typescript
  {
    totalConversations: number,
    openConversations: number,
    resolvedToday: number,
    totalMessages: number,
    avgResponseTimeMinutes: number,
    totalLeads: number,
    wonDeals: number,
    conversionRate: number,
    messagesChart: { date: string, sent: number, received: number }[],
    leadsByStage: { stage: string, count: number }[]
  }
  ```

#### Support (`app/api/tickets/`, `app/api/templates/`, `app/api/knowledge/`)
- [ ] `GET + POST /api/tickets` — CRUD with status/priority filters
- [ ] `PATCH /api/tickets/[id]` — update status, assignee
- [ ] `GET + POST /api/templates` — list and save WA message templates
- [ ] `GET + POST /api/knowledge` — list and save knowledge base documents
- [ ] `DELETE /api/knowledge/[id]` — delete doc

#### React Query Hooks
- [ ] `hooks/useMessages.ts` — `useSendMessage()` mutation, `useResolveConversation()` mutation
- [ ] `hooks/useLeads.ts` — `useCreateLead()`, `useUpdateLeadStage()` with optimistic update

#### CRITICAL RULE — every Prisma query:
```typescript
// Never forget tenantId or you will leak data across workspaces
const leads = await prisma.lead.findMany({
  where: { tenantId: session.user.tenantId }
});
```

---

## Data Model Quick Reference

**Lead stages:** `NEW_LEAD` → `CONTACTED` → `QUALIFIED` → `PROPOSAL_SENT` → `NEGOTIATION` → `WON` | `LOST`

**Score labels:** `COLD` 0-30 | `WARM` 31-60 | `HOT` 61-80 | `QUALIFIED` 81-100

**User roles:** `SUPER_ADMIN` | `TENANT_OWNER` | `ADMIN` | `AGENT`

**Message directions:** `INBOUND` (from customer) | `OUTBOUND` (from agent/AI)

---

## Git Workflow

```bash
# Commit format
git commit -m "feat(contacts): implement GET with pagination and tag filter"

# Prefixes: feat | fix | refactor | style | docs
# Scopes:   auth | contacts | inbox | leads | campaigns | ai | webhook | admin | ui | marketing
```

**Merge order when submitting PR:**
1. **Shalmon** first — shared lib/, validators/ needed by everyone
2. **Aman** second — fully isolated, no conflicts
3. **Gauransh** third — API routes
4. **Hemant** last — UI depends on hooks and types being finalized

---

## Demo Credentials

| | |
|---|---|
| URL | http://localhost:3000 |
| Email | admin@demo.com |
| Password | Demo@1234 |
| Role | Tenant Owner |
