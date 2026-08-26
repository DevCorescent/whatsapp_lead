import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Braces,
  Check,
  KeyRound,
  Radio,
  Send,
  ShieldCheck,
  Timer,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import { PageCta, PageHero, Section } from "@/components/marketing/PageShell";
import { Reveal, SectionHeading, Stage } from "@/components/marketing/home/primitives";
import { stagger } from "@/components/marketing/home/motion";

export const metadata: Metadata = {
  title: "WhatsCRM API — Developer documentation",
  description:
    "Build on WhatsCRM: authenticate, send WhatsApp messages, sync contacts and leads, and receive webhooks. Quickstart, concepts, rate limits and error handling.",
};

/**
 * The developer landing page for the platform API.
 *
 * SCOPE, STATED HONESTLY. The REST surface described here is the one this application
 * already exposes under /api, and workspace API keys are issued on request rather than
 * self-served from the dashboard — there is no key-management screen in this
 * repository, and documenting one would be documenting a page that does not exist.
 * The page says so in the access panel instead of implying a self-serve flow.
 *
 * SNIPPETS ARE STATIC MARKUP, not a syntax highlighter. Highlighting four short curl
 * and JSON blocks is not worth a client-side bundle on a marketing page; the blocks
 * are `<pre>` inside a dark card with a scroll container, which is what makes them
 * survive a 360px viewport without widening the page.
 *
 * The endpoint tables live on /api-reference. This page is the narrative half —
 * concepts, auth, webhooks, limits — and links across rather than duplicating.
 */

const CONCEPTS: { Icon: LucideIcon; title: string; body: string }[] = [
  {
    Icon: KeyRound,
    title: "Workspace-scoped keys",
    body: "Every key belongs to exactly one workspace. There is no cross-workspace read, so a leaked key can never reach another tenant's data.",
  },
  {
    Icon: Send,
    title: "Messages go through Meta",
    body: "Sends are relayed to the official WhatsApp Business Cloud API. Session windows and template rules are Meta's, and the API surfaces their errors verbatim.",
  },
  {
    Icon: Webhook,
    title: "Events, not polling",
    body: "Inbound messages, status changes, lead-score updates and ticket transitions are pushed to your endpoint as signed JSON.",
  },
  {
    Icon: Timer,
    title: "Idempotent writes",
    body: "Send an `Idempotency-Key` header on any POST and a retry after a timeout returns the original result instead of duplicating it.",
  },
];

const QUICKSTART = [
  {
    title: "Get a key",
    body: "Write to the team with your workspace name. Keys are issued per workspace and can be scoped read-only.",
  },
  {
    title: "Call the API",
    body: "Send the key as a bearer token. Every response is JSON; every error carries a machine-readable code.",
  },
  {
    title: "Receive webhooks",
    body: "Register an HTTPS endpoint, verify the signature header, and acknowledge with a 2xx within ten seconds.",
  },
];

const SNIPPETS: { label: string; language: string; code: string }[] = [
  {
    label: "Send a text message",
    language: "curl",
    code: `curl -X POST https://api.whatscrm.in/v1/messages \\
  -H "Authorization: Bearer $WHATSCRM_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: 7f1c0e2a" \\
  -d '{
    "to": "+919876543210",
    "type": "text",
    "text": { "body": "Your order has been dispatched." }
  }'`,
  },
  {
    label: "Create a contact",
    language: "curl",
    code: `curl -X POST https://api.whatscrm.in/v1/contacts \\
  -H "Authorization: Bearer $WHATSCRM_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Rahul Kumar",
    "phone": "+919876543210",
    "tags": ["website", "pricing-enquiry"]
  }'`,
  },
  {
    label: "An inbound webhook",
    language: "json",
    code: `{
  "event": "message.received",
  "workspaceId": "ws_2f9c",
  "occurredAt": "2026-06-18T09:41:22.104Z",
  "data": {
    "conversationId": "cnv_81b3",
    "contact": { "phone": "+919876543210", "name": "Rahul Kumar" },
    "message": { "type": "text", "body": "Is the 2BHK still available?" }
  }
}`,
  },
  {
    label: "An error response",
    language: "json",
    code: `{
  "error": {
    "code": "template_not_approved",
    "message": "Template 'order_update_v2' has not been approved by Meta.",
    "status": 422,
    "docs": "/api-reference#errors"
  }
}`,
  },
];

const EVENTS = [
  { name: "message.received", body: "A customer sent a message on your WhatsApp number." },
  { name: "message.status", body: "A message you sent was delivered, read or failed." },
  { name: "conversation.assigned", body: "A thread was assigned to an agent or a team." },
  { name: "lead.scored", body: "A lead's BANT score changed after a new message." },
  { name: "lead.stage_changed", body: "A lead moved between pipeline stages." },
  { name: "ticket.updated", body: "A ticket changed priority, assignee or status." },
];

const LIMITS = [
  { label: "Default rate limit", value: "120 requests / minute / workspace" },
  { label: "Burst allowance", value: "20 requests / second" },
  { label: "Webhook retry", value: "5 attempts, exponential backoff over 1 hour" },
  { label: "Payload ceiling", value: "1 MB per request body" },
];

/** A dark code card. Scrolls inside itself so a long line never widens the page. */
function Snippet({ label, language, code }: { label: string; language: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-slate-900 shadow-lg shadow-slate-900/20 ring-1 ring-inset ring-white/10">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <span className="text-xs font-semibold text-slate-200">{label}</span>
        <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-emerald-400">
          {language}
        </span>
      </div>
      <div className="relative overflow-x-auto">
        <pre className="px-4 py-4 font-mono text-[12px] leading-relaxed text-slate-300">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}

export default function ApiDocsPage() {
  return (
    <div>
      <PageHero
        eyebrow="WhatsCRM API"
        title="Build WhatsApp into whatever you already run"
        description="A REST API over the same workspace your team uses: send messages, sync contacts and leads, read analytics, and receive every event as a signed webhook."
        primaryCta={{ label: "Browse the reference", href: "/api-reference" }}
        secondaryCta={{ label: "Request a key", href: "/contact" }}
      >
        <div className="mx-auto mt-7 max-w-xl rounded-2xl bg-white/80 p-4 text-left shadow-sm ring-1 ring-inset ring-emerald-600/15 backdrop-blur">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            <span>
              API keys are issued per workspace by the team rather than self-served from the
              dashboard. Ask us and we will provision one, read-only if you prefer.
            </span>
          </p>
        </div>
      </PageHero>

      <Section tone="soft" glow>
        <SectionHeading
          align="center"
          eyebrow="Concepts"
          title="Four things to know before your first call"
        />
        <Stage className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CONCEPTS.map((concept, i) => (
            <div
              key={concept.title}
              style={stagger(i, 65)}
              className="wa-lift wa-hover-lift group h-full rounded-2xl bg-white p-5 shadow-sm ring-1 ring-inset ring-slate-900/5 hover:shadow-lg hover:shadow-emerald-900/5 hover:ring-emerald-500/25"
            >
              <span className="wa-icon-tilt flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-600/15 transition-colors duration-300 group-hover:bg-emerald-600 group-hover:ring-emerald-600">
                <concept.Icon className="h-4 w-4 text-emerald-600 transition-colors duration-300 group-hover:text-white" />
              </span>
              <h2 className="mt-4 text-sm font-bold tracking-tight text-slate-900">
                {concept.title}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{concept.body}</p>
            </div>
          ))}
        </Stage>
      </Section>

      <Section id="quickstart" tone="plain">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
          <div>
            <SectionHeading
              eyebrow="Quickstart"
              title="Three steps to your first message"
              description="Authentication is a bearer token. There is no SDK to install and no OAuth dance."
            />

            <Stage className="mt-7 space-y-3">
              {QUICKSTART.map((step, i) => (
                <div
                  key={step.title}
                  style={stagger(i, 90)}
                  className="wa-lift flex items-start gap-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-900/5"
                >
                  <span className="nums flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold tracking-tight text-slate-900">
                      {step.title}
                    </h3>
                    <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{step.body}</p>
                  </div>
                </div>
              ))}
            </Stage>

            <Reveal delay={160}>
              <div className="mt-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-inset ring-slate-900/5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Base URL
                </p>
                <p className="mt-1.5 overflow-x-auto font-mono text-sm text-slate-800">
                  https://api.whatscrm.in/v1
                </p>
              </div>
            </Reveal>
          </div>

          <Stage className="space-y-3">
            {SNIPPETS.map((snippet, i) => (
              <div key={snippet.label} style={stagger(i, 90)} className="wa-lift">
                <Snippet {...snippet} />
              </div>
            ))}
          </Stage>
        </div>
      </Section>

      <Section id="webhooks" tone="wash">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
          <div>
            <SectionHeading
              eyebrow="Webhooks"
              title="Six events, pushed as they happen"
              description="Register one HTTPS endpoint per workspace. Every delivery carries a signature header you verify against your signing secret before trusting the body."
            />
            <Stage className="mt-7 space-y-2">
              {EVENTS.map((event, i) => (
                <div
                  key={event.name}
                  style={stagger(i, 55)}
                  className="wa-lift group flex items-start gap-3 rounded-xl bg-white/80 p-3.5 shadow-sm ring-1 ring-inset ring-slate-900/5 backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:ring-emerald-500/25"
                >
                  <Radio
                    className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 transition-transform duration-300 group-hover:scale-110"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="font-mono text-[13px] font-semibold text-slate-900">
                      {event.name}
                    </p>
                    <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{event.body}</p>
                  </div>
                </div>
              ))}
            </Stage>
          </div>

          <div>
            <SectionHeading
              eyebrow="Limits & errors"
              title="What happens when things go wrong"
              description="Rate limits are per workspace, not per key. Every error response carries a stable `code` you can branch on — never only a prose message."
            />

            <Stage className="mt-7 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-inset ring-slate-900/5">
              <dl>
                {LIMITS.map((limit, i) => (
                  <div
                    key={limit.label}
                    style={stagger(i, 70)}
                    className="wa-lift flex flex-col gap-1 border-b border-slate-100 px-5 py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <dt className="text-sm text-slate-600">{limit.label}</dt>
                    <dd className="nums text-sm font-semibold text-slate-900">{limit.value}</dd>
                  </div>
                ))}
              </dl>
            </Stage>

            <Reveal delay={160}>
              <ul className="mt-5 space-y-2">
                {[
                  "429 responses include a Retry-After header in seconds.",
                  "5xx responses are safe to retry with the same Idempotency-Key.",
                  "Meta's own template and session-window errors are passed through unchanged.",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2 text-sm text-slate-600">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                    {line}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </Section>

      <Section tone="plain">
        <Reveal>
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-slate-50 p-6 text-center ring-1 ring-inset ring-slate-900/5 sm:flex-row sm:justify-between sm:text-left">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-inset ring-emerald-600/15">
                <Braces className="h-5 w-5 text-emerald-600" aria-hidden />
              </span>
              <div>
                <h2 className="text-base font-bold tracking-tight text-slate-900">
                  Looking for the endpoint list?
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Every path, parameter, response shape and error code lives in the reference.
                </p>
              </div>
            </div>
            <Link
              href="/api-reference"
              className="group inline-flex shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              API reference
              <ArrowRight className="h-4 w-4 text-emerald-400 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </Reveal>
      </Section>

      <PageCta
        title="Need a key, or a hand with the first integration?"
        description="Tell us what you are building and we will provision a workspace key and answer your questions directly."
        primary={{ label: "Request API access", href: "/contact" }}
        secondary={{ label: "Read the reference", href: "/api-reference" }}
      />
    </div>
  );
}
