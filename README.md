# WhatsApp CRM & Lead Management SaaS

AI-Powered WhatsApp CRM, Automation & Lead Management platform built with Next.js 16 (App Router), Prisma, Neon PostgreSQL, and OpenAI.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) — full-stack |
| Database | PostgreSQL on Neon (serverless) |
| ORM | Prisma v7 |
| Auth | NextAuth v5 (credentials + JWT) |
| AI | OpenAI GPT-4o-mini |
| Vector DB | Pinecone (RAG knowledge base) |
| Real-time | Pusher (WebSocket) |
| Queue | BullMQ + Redis (campaign sending) |
| Validation | Zod |
| UI | Tailwind CSS v4 |
| State | TanStack React Query v5 |

---

## Project Structure

```
whatsapp_lead/
├── app/
│   ├── (marketing)/          # Public landing pages — AMAN
│   ├── (auth)/               # Login, Register, Forgot Password — HEMANT (UI) / SHALMON (logic)
│   ├── (dashboard)/          # Tenant workspace — HEMANT (UI) / GAURANSH (data)
│   ├── (admin)/              # Super-admin panel — HEMANT (UI) / SHALMON (APIs)
│   └── api/
│       ├── auth/             # NextAuth + register — SHALMON
│       ├── contacts/         # CRM contacts CRUD — SHALMON
│       ├── conversations/    # WhatsApp inbox — GAURANSH
│       ├── messages/         # Send message — GAURANSH
│       ├── leads/            # Lead pipeline — GAURANSH
│       ├── campaigns/        # Bulk messaging — GAURANSH
│       ├── tickets/          # Support tickets — GAURANSH
│       ├── templates/        # WA templates — GAURANSH
│       ├── knowledge/        # RAG docs — GAURANSH
│       ├── analytics/        # Dashboard KPIs — GAURANSH
│       ├── ai/               # AI endpoints — GAURANSH
│       ├── webhook/          # WhatsApp webhook — GAURANSH
│       └── admin/            # Super-admin APIs — SHALMON
├── lib/
│   ├── auth.ts               # NextAuth config — SHALMON
│   ├── prisma.ts             # DB client singleton
│   ├── ai.ts                 # OpenAI helpers — GAURANSH
│   ├── whatsapp.ts           # WA Cloud API client — GAURANSH
│   └── validators/           # Zod schemas — SHALMON
├── hooks/                    # React Query hooks
├── types/                    # TypeScript types
├── components/               # Shared UI components
├── prisma/
│   ├── schema.prisma         # Full data model (16 models)
│   └── seed.ts               # Plans + demo data
└── middleware.ts             # Auth + tenant route guard
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+
- Access to `.env` file (get from team lead — never commit it)

### Setup

```bash
# 1. Clone the repo
git clone <repo-url>
cd whatsapp_lead

# 2. Install dependencies
npm install

# 3. Copy env file
cp .env.example .env
# Fill in your values — ask team lead for secrets

# 4. Generate Prisma client
npm run db:generate

# 5. Run development server
npm run dev
```

> **Note:** Schema is already pushed to Neon. Do NOT run `npm run db:push` unless the schema changed.

### Seed Demo Data

```bash
npm run db:seed
```

Creates:
- 3 plans: Starter (999/mo), Growth (2999/mo), Enterprise (9999/mo)
- Demo workspace: `demo-workspace`
- Demo login: `admin@demo.com` / `Demo@1234`

---

## Environment Variables

See `.env.example` for all required variables. Key ones:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `AUTH_SECRET` | NextAuth secret (32+ chars) |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp phone number ID |
| `WHATSAPP_API_KEY` | Meta WhatsApp access token |
| `WHATSAPP_VERIFY_TOKEN` | Webhook verification token |
| `OPENAI_API_KEY` | OpenAI API key |
| `PINECONE_API_KEY` | Pinecone vector DB key |
| `REDIS_URL` | Redis URL for BullMQ |
| `PUSHER_APP_ID` / `PUSHER_KEY` / `PUSHER_SECRET` | Pusher credentials |

---

## Intern Task Assignments

### Branch Strategy

Each intern works on their own branch. **Never commit to `master` directly.**

| Intern | Branch | Module |
|---|---|---|
| Shalmon | `feature/shalmon-auth-crm` | Auth, CRM APIs, Admin APIs |
| Aman | `feature/aman-landing-marketing` | Landing pages, Marketing UI |
| Hemant | `feature/hemant-dashboard-inbox` | Dashboard UI, Admin UI |
| Gauransh | `feature/gauransh-whatsapp-leads` | WhatsApp, AI, Leads, Campaigns |

```bash
# Switch to your branch
git checkout feature/<your-branch-name>

# Pull latest changes from master before starting each day
git fetch origin
git rebase origin/master
```

---

### Shalmon — Auth, CRM & Admin APIs

**Branch:** `feature/shalmon-auth-crm`

**Files you own:**
- `app/api/auth/register/route.ts` — Complete registration with tenant creation (DONE)
- `app/api/contacts/route.ts` — GET (list + search/filter) + POST (create)
- `app/api/contacts/[id]/route.ts` — GET, PATCH, DELETE
- `app/api/admin/tenants/route.ts` — List + provision tenants
- `app/api/admin/tenants/[id]/route.ts` — CRUD + suspend
- `app/api/admin/plans/route.ts` — Plan management
- `app/api/admin/stats/route.ts` — Platform stats
- `lib/auth.ts` — NextAuth config (DONE)
- `lib/validators/` — All Zod schemas (DONE)
- `hooks/useContacts.ts` — Complete the mutations

**Key tasks (search TODO [SHALMON]):**
1. Implement `GET /api/contacts` — pagination, search by name/phone, filter by tag
2. Implement `POST /api/contacts` — validate with createContactSchema, check duplicate phone per tenant
3. Implement `PATCH /api/contacts/[id]` — partial update
4. Implement `DELETE /api/contacts/[id]` — soft delete (isActive: false)
5. Admin tenant list + stats endpoints

---

### Aman — Landing Pages & Marketing UI

**Branch:** `feature/aman-landing-marketing`

**Files you own:**
- `app/(marketing)/page.tsx` — Homepage
- `app/(marketing)/pricing/page.tsx` — Pricing page
- `app/(marketing)/features/page.tsx` — Features showcase
- `app/(marketing)/contact/page.tsx` — Contact form
- `app/(marketing)/about/page.tsx`, `industries/page.tsx`, `blog/page.tsx`
- `app/(marketing)/privacy-policy/page.tsx`, `terms/page.tsx`, `refund-policy/page.tsx`
- `components/marketing/` — All marketing UI components

**Key tasks (search TODO [AMAN]):**
1. **Homepage** — Hero (headline + CTA + product screenshot), Features grid, Testimonials, Pricing preview, CTA banner
2. **Pricing page** — 3 plan cards, monthly/annual toggle, feature comparison table
3. **Navbar** — Logo, nav links, Login + "Start Free Trial" buttons
4. **Footer** — Links, social icons, copyright
5. Design: purple (#6C3FC4) primary, mobile responsive with Tailwind

---

### Hemant — Dashboard & Admin UI

**Branch:** `feature/hemant-dashboard-inbox`

**Files you own:**
- `app/(dashboard)/` — All dashboard page UIs
- `app/(admin)/` — All admin panel page UIs
- `components/dashboard/`, `components/inbox/`, `components/leads/`

**Key tasks (search TODO [HEMANT]):**
1. **Dashboard Layout** — Sidebar with nav + icons, Topbar with search + notifications
2. **Inbox page** — 3-column: conversation list | chat bubbles | contact info panel
3. **Leads Kanban** — 7 columns, drag-drop cards with score badges
4. **Analytics page** — 8 KPI cards + Recharts charts
5. **Admin panel** — Dark theme, tenant table, plan cards, revenue charts
6. Use `lucide-react` for icons, `clsx` + `tailwind-merge` for styles

---

### Gauransh — WhatsApp, AI, Leads & Real-time

**Branch:** `feature/gauransh-whatsapp-leads`

**Files you own:**
- `app/api/webhook/whatsapp/route.ts`
- `app/api/conversations/`, `app/api/messages/`, `app/api/leads/`
- `app/api/campaigns/`, `app/api/tickets/`, `app/api/templates/`
- `app/api/knowledge/`, `app/api/analytics/`, `app/api/ai/`
- `lib/whatsapp.ts`, `lib/ai.ts`
- `hooks/useMessages.ts`, `hooks/useLeads.ts`

**Key tasks (search TODO [GAURANSH]):**
1. WhatsApp webhook — parse message, upsert contact, save to DB, Pusher broadcast, AI auto-reply
2. Send message — call sendTextMessage(), save to DB, broadcast
3. Lead pipeline — GET grouped by stage, PATCH with stage transition + LeadActivity log
4. AI qualify — BANT extraction (25pts each), score labels: 0-30 COLD, 31-60 WARM, 61-80 HOT, 81-100 QUALIFIED
5. AI summarize — 3-4 bullet points: intent, concerns, action items
6. Analytics — Prisma groupBy/count/avg aggregations

**CRITICAL:** Every Prisma query must include `tenantId: session.user.tenantId`

---

## Data Model Summary

**Lead pipeline stages:**
`NEW_LEAD` → `CONTACTED` → `QUALIFIED` → `PROPOSAL_SENT` → `NEGOTIATION` → `WON` | `LOST`

**Score labels:** COLD (0-30) | WARM (31-60) | HOT (61-80) | QUALIFIED (81-100)

**User roles:** `SUPER_ADMIN` | `TENANT_OWNER` | `ADMIN` | `AGENT`

See `prisma/schema.prisma` for the full 16-model schema.

---

## Git Workflow

```bash
# Commit message format
git commit -m "feat(contacts): implement GET with search + pagination"

# Types: feat | fix | refactor | style | docs
# Scopes: auth | contacts | inbox | leads | campaigns | ai | webhook | admin | ui
```

**Merge order (to minimize conflicts):**
1. Shalmon first (shared lib/, validators/)
2. Aman second (isolated marketing pages)
3. Gauransh third (API routes)
4. Hemant last (UI pages that import from hooks)

---

## Demo Credentials

| Field | Value |
|---|---|
| URL | http://localhost:3000 |
| Email | admin@demo.com |
| Password | Demo@1234 |
| Role | Tenant Owner |
| Workspace | demo-workspace |
