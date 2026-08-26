import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageCta, PageHero, Section } from "@/components/marketing/PageShell";
import { Reveal, SectionHeading, Stage } from "@/components/marketing/home/primitives";
import { stagger } from "@/components/marketing/home/motion";

export const metadata: Metadata = {
  title: "API Reference — WhatsCRM API",
  description:
    "Every WhatsCRM API endpoint: messages, conversations, contacts, leads, campaigns, templates, tickets, knowledge base and analytics — with parameters, responses and error codes.",
};

/**
 * The endpoint reference.
 *
 * PATHS MIRROR THE APPLICATION'S OWN ROUTES under app/api, versioned under /v1. That
 * is not a coincidence and it is the reason this page can be trusted: the reference
 * describes the surface that exists rather than a surface someone would like to exist.
 *
 * ONE TABLE PER RESOURCE, and the method is a coloured chip rather than a word in a
 * cell — a reader scanning for "the DELETE one" finds it by colour in a fraction of
 * the time. Each table scrolls inside its own container: three columns of monospace
 * paths will not fit a phone, and a page that scrolls sideways feels broken.
 *
 * The narrative half — auth, webhooks, rate limits, idempotency — lives on /api-docs.
 * This page links back rather than repeating it.
 */

type Method = "GET" | "POST" | "PATCH" | "DELETE";

const METHOD_STYLES: Record<Method, string> = {
  GET: "bg-sky-50 text-sky-700 ring-sky-600/15",
  POST: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  PATCH: "bg-amber-50 text-amber-700 ring-amber-600/15",
  DELETE: "bg-rose-50 text-rose-700 ring-rose-600/15",
};

type Endpoint = { method: Method; path: string; summary: string; params: string };

type Group = { id: string; title: string; blurb: string; endpoints: Endpoint[] };

const GROUPS: Group[] = [
  {
    id: "messages",
    title: "Messages",
    blurb: "Send on your WhatsApp number and read what has already been sent or received.",
    endpoints: [
      {
        method: "POST",
        path: "/v1/messages",
        summary: "Send a text, media, template or interactive message.",
        params: "to, type, text | media | template, idempotencyKey",
      },
      {
        method: "GET",
        path: "/v1/messages",
        summary: "List messages, newest first.",
        params: "conversationId, before, after, limit",
      },
      {
        method: "GET",
        path: "/v1/messages/{id}",
        summary: "Fetch one message with its delivery status.",
        params: "—",
      },
    ],
  },
  {
    id: "conversations",
    title: "Conversations",
    blurb: "Threads, their assignment and their state.",
    endpoints: [
      {
        method: "GET",
        path: "/v1/conversations",
        summary: "List conversations with the latest message on each.",
        params: "status, assigneeId, tag, search, limit, cursor",
      },
      {
        method: "GET",
        path: "/v1/conversations/{id}",
        summary: "Fetch one thread with its contact and message history.",
        params: "—",
      },
      {
        method: "PATCH",
        path: "/v1/conversations/{id}",
        summary: "Assign, close, reopen or tag a thread.",
        params: "assigneeId, status, tags",
      },
    ],
  },
  {
    id: "contacts",
    title: "Contacts",
    blurb: "The people on the other end of every conversation.",
    endpoints: [
      {
        method: "GET",
        path: "/v1/contacts",
        summary: "List or search contacts.",
        params: "search, tag, source, limit, cursor",
      },
      {
        method: "POST",
        path: "/v1/contacts",
        summary: "Create a contact, or update one by matching phone number.",
        params: "name, phone, email, tags, customFields",
      },
      {
        method: "GET",
        path: "/v1/contacts/{id}",
        summary: "Fetch one contact with its lead and conversation links.",
        params: "—",
      },
      {
        method: "PATCH",
        path: "/v1/contacts/{id}",
        summary: "Update fields or tags on a contact.",
        params: "name, email, tags, customFields",
      },
      {
        method: "DELETE",
        path: "/v1/contacts/{id}",
        summary: "Delete a contact and its personal data.",
        params: "—",
      },
    ],
  },
  {
    id: "leads",
    title: "Leads & pipeline",
    blurb: "Qualification scores, stages and pipeline movement.",
    endpoints: [
      {
        method: "GET",
        path: "/v1/leads",
        summary: "List leads filtered by stage, score band or owner.",
        params: "stage, minScore, maxScore, ownerId, limit, cursor",
      },
      {
        method: "POST",
        path: "/v1/leads",
        summary: "Create a lead against an existing contact.",
        params: "contactId, stage, value, source, notes",
      },
      {
        method: "GET",
        path: "/v1/leads/{id}",
        summary: "Fetch a lead with its BANT breakdown and score history.",
        params: "—",
      },
      {
        method: "PATCH",
        path: "/v1/leads/{id}",
        summary: "Move a lead between stages or change its owner.",
        params: "stage, ownerId, value, notes",
      },
      {
        method: "GET",
        path: "/v1/lead-stages",
        summary: "List the pipeline stages configured for the workspace.",
        params: "—",
      },
    ],
  },
  {
    id: "campaigns",
    title: "Campaigns & templates",
    blurb: "Broadcasts to a segment, and the Meta-approved templates they use.",
    endpoints: [
      {
        method: "GET",
        path: "/v1/campaigns",
        summary: "List campaigns with per-recipient counters.",
        params: "status, limit, cursor",
      },
      {
        method: "POST",
        path: "/v1/campaigns",
        summary: "Create and optionally schedule a campaign.",
        params: "name, templateId, segment, scheduledAt, variables",
      },
      {
        method: "GET",
        path: "/v1/campaigns/{id}",
        summary: "Fetch a campaign with delivery, read and reply breakdown.",
        params: "—",
      },
      {
        method: "GET",
        path: "/v1/templates",
        summary: "List templates and their Meta approval status.",
        params: "status, category, language",
      },
      {
        method: "POST",
        path: "/v1/templates",
        summary: "Submit a template to Meta for review.",
        params: "name, category, language, components",
      },
    ],
  },
  {
    id: "tickets",
    title: "Tickets",
    blurb: "Support threads with a priority and an SLA clock.",
    endpoints: [
      {
        method: "GET",
        path: "/v1/tickets",
        summary: "List tickets by status, priority or assignee.",
        params: "status, priority, assigneeId, limit, cursor",
      },
      {
        method: "POST",
        path: "/v1/tickets",
        summary: "Open a ticket from a conversation.",
        params: "conversationId, subject, priority, assigneeId",
      },
      {
        method: "PATCH",
        path: "/v1/tickets/{id}",
        summary: "Reassign, reprioritise or resolve a ticket.",
        params: "status, priority, assigneeId, resolution",
      },
    ],
  },
  {
    id: "knowledge",
    title: "Knowledge base",
    blurb: "The documents the AI answers from, and the FAQs layered on them.",
    endpoints: [
      {
        method: "GET",
        path: "/v1/knowledge",
        summary: "List indexed documents and their processing state.",
        params: "status, limit, cursor",
      },
      {
        method: "POST",
        path: "/v1/knowledge",
        summary: "Upload a PDF or DOCX, or submit raw text, for indexing.",
        params: "title, file | text, tags",
      },
      {
        method: "DELETE",
        path: "/v1/knowledge/{id}",
        summary: "Remove a document and its embeddings.",
        params: "—",
      },
    ],
  },
  {
    id: "analytics",
    title: "Analytics",
    blurb: "The same figures the dashboard renders, as JSON.",
    endpoints: [
      {
        method: "GET",
        path: "/v1/analytics",
        summary: "Response times, lead counts, conversion and campaign performance.",
        params: "from, to, granularity, metrics",
      },
      {
        method: "GET",
        path: "/v1/export",
        summary: "Export contacts, leads or interactions as CSV.",
        params: "resource, from, to, format",
      },
    ],
  },
];

const ERRORS: { code: string; status: string; body: string }[] = [
  { code: "unauthorized", status: "401", body: "Missing, malformed or revoked API key." },
  { code: "forbidden", status: "403", body: "The key is valid but not scoped for this action." },
  { code: "not_found", status: "404", body: "No resource with that id in this workspace." },
  {
    code: "validation_failed",
    status: "422",
    body: "A parameter is missing or the wrong shape. `details` names the field.",
  },
  {
    code: "template_not_approved",
    status: "422",
    body: "Meta has not approved the template you tried to send.",
  },
  {
    code: "outside_session_window",
    status: "422",
    body: "The 24-hour window has closed; send an approved template instead.",
  },
  {
    code: "rate_limited",
    status: "429",
    body: "Workspace rate limit reached. Wait for `Retry-After` seconds.",
  },
  {
    code: "upstream_error",
    status: "502",
    body: "Meta's Cloud API returned an error. `upstream` carries their payload.",
  },
];

function MethodChip({ method }: { method: Method }) {
  return (
    <span
      className={cn(
        "nums inline-flex w-[4.25rem] shrink-0 items-center justify-center rounded-md px-2 py-1 font-mono text-[10px] font-bold tracking-wider ring-1 ring-inset",
        METHOD_STYLES[method],
      )}
    >
      {method}
    </span>
  );
}

export default function ApiReferencePage() {
  return (
    <div>
      <PageHero
        eyebrow="API Reference"
        title="Every endpoint, in one page"
        description="Eight resource groups covering messages, conversations, contacts, leads, campaigns, tickets, the knowledge base and analytics. Authentication and webhooks are covered in the docs."
        primaryCta={{ label: "Read the docs", href: "/api-docs" }}
        secondaryCta={{ label: "Request a key", href: "/contact" }}
      >
        <div className="mx-auto mt-7 max-w-xl overflow-x-auto rounded-2xl bg-slate-900 p-4 text-left shadow-lg shadow-slate-900/20 ring-1 ring-inset ring-white/10">
          <pre className="font-mono text-[12px] leading-relaxed text-slate-300">
            <code>{`Authorization: Bearer $WHATSCRM_API_KEY
Base URL:      https://api.whatscrm.in/v1`}</code>
          </pre>
        </div>
      </PageHero>

      {/* The jump bar. Anchor links rather than a sticky sidebar: eight groups is a
          list you can hold in your head, and a sidebar would cost this page a client
          bundle for scroll-spy that nothing else here needs. */}
      <Section tone="soft" glow className="!py-8">
        <Reveal>
          <nav aria-label="Endpoint groups">
            <ul className="flex flex-wrap justify-center gap-2">
              {GROUPS.map((group) => (
                <li key={group.id}>
                  <a
                    href={`#${group.id}`}
                    className="inline-block rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-900/5 transition duration-200 hover:-translate-y-0.5 hover:text-emerald-700 hover:ring-emerald-500/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                  >
                    {group.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </Reveal>
      </Section>

      <Section tone="plain">
        <div className="space-y-10">
          {GROUPS.map((group) => (
            <Stage key={group.id} id={group.id} className="scroll-mt-24">
              <h2 className="wa-lift text-xl font-bold tracking-tight text-slate-900">
                {group.title}
              </h2>
              <p style={stagger(1, 70)} className="wa-lift mt-1 text-sm text-slate-600">
                {group.blurb}
              </p>

              <div
                style={stagger(2, 70)}
                className="wa-lift relative mt-4 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-inset ring-slate-900/5"
              >
                <table className="w-full min-w-[44rem] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th
                        scope="col"
                        className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                      >
                        Endpoint
                      </th>
                      <th
                        scope="col"
                        className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                      >
                        Description
                      </th>
                      <th
                        scope="col"
                        className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                      >
                        Parameters
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.endpoints.map((endpoint) => (
                      <tr
                        key={endpoint.method + endpoint.path}
                        className="border-b border-slate-100 transition-colors duration-200 last:border-0 hover:bg-emerald-50/40"
                      >
                        <td className="px-5 py-3.5">
                          <span className="flex items-center gap-2.5">
                            <MethodChip method={endpoint.method} />
                            <code className="font-mono text-[13px] font-medium text-slate-900">
                              {endpoint.path}
                            </code>
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-slate-600">{endpoint.summary}</td>
                        <td className="px-5 py-3.5 font-mono text-[12px] text-slate-500">
                          {endpoint.params}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Stage>
          ))}
        </div>
      </Section>

      <Section id="errors" tone="wash">
        <SectionHeading
          eyebrow="Errors"
          title="Eight codes worth branching on"
          description="Every error response carries a stable `code`, an HTTP `status` and a human `message`. Branch on the code — the message is written for people and may change."
        />

        <Stage className="relative mt-8 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-inset ring-slate-900/5">
          <table className="w-full min-w-[38rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200">
                <th
                  scope="col"
                  className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                >
                  Code
                </th>
                <th
                  scope="col"
                  className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                >
                  When it happens
                </th>
              </tr>
            </thead>
            <tbody>
              {ERRORS.map((error) => (
                <tr key={error.code} className="border-b border-slate-100 last:border-0">
                  <td className="px-5 py-3.5">
                    <code className="font-mono text-[13px] font-semibold text-slate-900">
                      {error.code}
                    </code>
                  </td>
                  <td className="nums px-5 py-3.5 font-mono text-[13px] text-slate-500">
                    {error.status}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-slate-600">{error.body}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Stage>

        <Reveal delay={140}>
          <p className="mt-5 inline-flex items-start gap-2 rounded-xl bg-white/80 px-4 py-3 text-xs leading-relaxed text-slate-600 shadow-sm ring-1 ring-inset ring-slate-900/5 backdrop-blur">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            Errors raised by Meta&apos;s Cloud API are passed through under{" "}
            <code className="font-mono">upstream</code> rather than rewritten, so you can act on
            their codes directly.
          </p>
        </Reveal>

        <Reveal delay={200}>
          <Link
            href="/api-docs"
            className="group mt-7 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 transition hover:text-emerald-800"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" />
            Back to authentication, webhooks and rate limits
          </Link>
        </Reveal>
      </Section>

      <PageCta
        title="Ready to build?"
        description="Request a workspace key and we will help you get the first call returning 200."
        primary={{ label: "Request API access", href: "/contact" }}
        secondary={{ label: "Read the docs", href: "/api-docs" }}
      />
    </div>
  );
}
