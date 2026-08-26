import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Bot,
  Building2,
  Car,
  GraduationCap,
  Layers,
  Megaphone,
  MessageSquare,
  ShieldCheck,
  ShoppingCart,
  Ticket,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { PageCta, PageHero, Section } from "@/components/marketing/PageShell";
import { Reveal, SectionHeading, Stage } from "@/components/marketing/home/primitives";
import { stagger } from "@/components/marketing/home/motion";

export const metadata: Metadata = {
  title: "Portfolio — WhatsCRM",
  description:
    "The surfaces we have shipped and the reference builds behind them — how a real estate, EdTech, e-commerce or automotive workspace is actually configured in WhatsCRM.",
};

/**
 * Portfolio.
 *
 * THE HONEST VERSION OF THIS PAGE. A portfolio usually means logos and a recovered-
 * revenue figure under each one. This project has no customer permission to publish a
 * name and no verified figure to publish next to it, and inventing either is the one
 * mistake on a marketing site that cannot be walked back.
 *
 * So the portfolio here is the work itself, in two parts:
 *
 *   BUILT — the eight product surfaces that exist in this repository, each described
 *   by what it does rather than by how well it did it.
 *
 *   REFERENCE BUILDS — how a workspace is actually configured for four kinds of
 *   business: which documents go into the knowledge base, which flow runs, what the
 *   qualification rule is, where the lead ends up. Every one is labelled a reference
 *   build, not a customer, and describes configuration rather than outcomes.
 *
 * That is a portfolio a technical buyer can check, and it answers the question they
 * came with — "what would mine look like" — better than a logo wall would.
 */

const SURFACES: { Icon: LucideIcon; title: string; body: string; href: string }[] = [
  {
    Icon: MessageSquare,
    title: "Shared inbox",
    body: "One WhatsApp number, every agent, with assignment, internal notes and full thread history.",
    href: "/features#shared-inbox",
  },
  {
    Icon: Bot,
    title: "AI auto-reply",
    body: "Retrieval over your own documents, with the source file shown beside every answer.",
    href: "/features#ai-auto-reply",
  },
  {
    Icon: BookOpen,
    title: "Knowledge base",
    body: "PDFs, DOCX and pasted text, chunked and indexed. Per-document FAQs on top.",
    href: "/features#knowledge-base",
  },
  {
    Icon: Workflow,
    title: "Automation flows",
    body: "A drag-and-drop canvas with twelve block types — conditions, delays, handoffs, webhooks.",
    href: "/features#ai-auto-reply",
  },
  {
    Icon: BarChart3,
    title: "Lead pipeline",
    body: "BANT extraction, a 0–100 score and pipeline stages that move without anyone editing a field.",
    href: "/features#lead-pipeline",
  },
  {
    Icon: Megaphone,
    title: "Campaigns",
    body: "Segment builder, Meta-approved templates and per-recipient delivery, read and reply tracking.",
    href: "/features#campaigns",
  },
  {
    Icon: Ticket,
    title: "Tickets",
    body: "Any conversation becomes a ticket with a priority, an SLA clock and a routing rule.",
    href: "/features#shared-inbox",
  },
  {
    Icon: Layers,
    title: "Multi-tenant admin",
    body: "Isolated workspaces, six roles, plan limits and feature gates enforced server-side.",
    href: "/features",
  },
];

type Build = {
  id: string;
  Icon: LucideIcon;
  sector: string;
  title: string;
  brief: string;
  setup: { label: string; value: string }[];
  tags: string[];
};

const BUILDS: Build[] = [
  {
    id: "real-estate",
    Icon: Building2,
    sector: "Real Estate",
    title: "Site-visit qualification for a multi-project developer",
    brief:
      "Enquiries arrive from portal ads and hoardings on one number. The build sorts them by budget and possession timeline before a sales manager sees the thread.",
    setup: [
      { label: "Knowledge base", value: "Project brochures, price sheets, floor plans, RERA notes" },
      { label: "Flow", value: "Greeting → project picker → budget & timeline → site-visit slot" },
      { label: "Qualification", value: "BANT weighted to budget and timeline; score ≥ 70 routed to a manager" },
      { label: "Pipeline", value: "New → Qualified → Visit booked → Negotiation → Closed" },
    ],
    tags: ["Knowledge base", "Flows", "Lead scoring", "Assignment"],
  },
  {
    id: "edtech",
    Icon: GraduationCap,
    sector: "EdTech & Coaching",
    title: "Admissions counselling for a multi-batch institute",
    brief:
      "Course, fee and batch-timing questions answered from the prospectus at any hour, with counsellors pulled in only when a parent asks about instalments.",
    setup: [
      { label: "Knowledge base", value: "Prospectus, fee structure, batch calendar, scholarship rules" },
      { label: "Flow", value: "Course interest → eligibility → batch preference → counsellor handoff" },
      { label: "Qualification", value: "Need and timeline first; budget deferred to the counsellor" },
      { label: "Campaigns", value: "Batch-start reminders segmented by course interest" },
    ],
    tags: ["AI replies", "Campaigns", "Handoff", "Segments"],
  },
  {
    id: "ecommerce",
    Icon: ShoppingCart,
    sector: "E-commerce",
    title: "Order support and repeat purchase for a D2C brand",
    brief:
      "Where-is-my-order and returns handled as tickets, product questions answered from the catalogue, and past buyers segmented for a festive send.",
    setup: [
      { label: "Knowledge base", value: "Catalogue, sizing guide, returns and shipping policy" },
      { label: "Flow", value: "Intent split → order status → returns → product question → agent" },
      { label: "Tickets", value: "Returns and damages open a ticket with a 24-hour SLA" },
      { label: "Campaigns", value: "Repeat-buyer segment, template broadcast, replies back to the inbox" },
    ],
    tags: ["Tickets", "Catalogue Q&A", "Campaigns", "SLA"],
  },
  {
    id: "automotive",
    Icon: Car,
    sector: "Automotive",
    title: "Test-drive booking across a dealership group",
    brief:
      "One number for several showrooms. The build identifies the model of interest and the nearest branch, then books the test drive against the right team.",
    setup: [
      { label: "Knowledge base", value: "Model specs, variant pricing, finance and exchange terms" },
      { label: "Flow", value: "Model → variant → branch → test-drive slot → confirmation" },
      { label: "Qualification", value: "Finance intent and purchase window drive the score" },
      { label: "Routing", value: "Branch-based assignment with a fallback to the group desk" },
    ],
    tags: ["Routing", "Flows", "Lead scoring", "Multi-branch"],
  },
];

const STACK = [
  "Next.js App Router",
  "TypeScript",
  "Prisma + Postgres",
  "Meta WhatsApp Cloud API",
  "Vector retrieval",
  "Role-based access",
  "Webhook delivery",
  "Multi-tenant isolation",
];

export default function PortfolioPage() {
  return (
    <div>
      <PageHero
        eyebrow="Portfolio"
        title="The work, and what a workspace built on it looks like"
        description="Eight product surfaces we have shipped, and four reference builds showing exactly how a workspace is configured for a real kind of business — documents, flows, scoring rules and routing."
        primaryCta={{ label: "Start Free Trial", href: "/register" }}
        secondaryCta={{ label: "Talk to us", href: "/contact" }}
      >
        <p className="mx-auto mt-6 max-w-xl text-xs leading-relaxed text-slate-500">
          Reference builds describe configuration, not customers. We publish no client
          names or performance figures we cannot evidence.
        </p>
      </PageHero>

      <Section tone="soft" glow>
        <SectionHeading
          align="center"
          eyebrow="Built"
          title="Eight surfaces, one workspace"
          description="Each of these is shipped and running in the product today, not on a roadmap."
        />

        <Stage className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SURFACES.map((surface, i) => (
            <Link
              key={surface.title}
              href={surface.href}
              style={stagger(i, 55)}
              className="wa-lift wa-hover-lift group flex h-full flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-inset ring-slate-900/5 hover:shadow-lg hover:shadow-emerald-900/5 hover:ring-emerald-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              <span className="wa-icon-tilt flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-600/15 transition-colors duration-300 group-hover:bg-emerald-600 group-hover:ring-emerald-600">
                <surface.Icon className="h-4 w-4 text-emerald-600 transition-colors duration-300 group-hover:text-white" />
              </span>
              <h3 className="mt-4 text-sm font-bold tracking-tight text-slate-900">
                {surface.title}
              </h3>
              <p className="mt-1.5 flex-1 text-xs leading-relaxed text-slate-500">
                {surface.body}
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                Details
                <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </Stage>
      </Section>

      <Section tone="plain">
        <SectionHeading
          align="center"
          eyebrow="Reference builds"
          title="Four workspaces, configured end to end"
          description="What actually goes into the knowledge base, which flow runs, how the score is weighted, and where the lead lands."
        />

        <Stage className="mt-9 grid gap-4 lg:grid-cols-2">
          {BUILDS.map((build, i) => (
            <article
              key={build.id}
              id={build.id}
              style={stagger(i, 80)}
              className="wa-lift wa-hover-lift group scroll-mt-24 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-inset ring-slate-900/5 hover:shadow-xl hover:shadow-emerald-900/5 hover:ring-emerald-500/25"
            >
              {/* A tinted header rather than an image. There are no screenshots to
                  publish here, and a stock photo of a handshake is worse than none. */}
              <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-900 px-6 py-5">
                <div
                  aria-hidden
                  className="wa-dots pointer-events-none absolute inset-0 opacity-40"
                />
                <div className="relative flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 transition-colors duration-300 group-hover:border-emerald-400/50 group-hover:bg-emerald-400/20">
                    <build.Icon className="h-5 w-5 text-emerald-300" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-400">
                      {build.sector}
                    </p>
                    <h3 className="mt-1 text-base font-bold leading-snug tracking-tight text-white">
                      {build.title}
                    </h3>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <p className="text-sm leading-relaxed text-slate-600">{build.brief}</p>

                <dl className="mt-5 space-y-3">
                  {build.setup.map((row) => (
                    <div
                      key={row.label}
                      className="grid gap-1 border-t border-slate-100 pt-3 sm:grid-cols-[8.5rem_1fr] sm:gap-3"
                    >
                      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        {row.label}
                      </dt>
                      <dd className="text-sm leading-relaxed text-slate-700">{row.value}</dd>
                    </div>
                  ))}
                </dl>

                <ul className="mt-5 flex flex-wrap gap-1.5">
                  {build.tags.map((tag) => (
                    <li
                      key={tag}
                      className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/15"
                    >
                      {tag}
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </Stage>

        <Reveal delay={140}>
          <div className="mt-8 flex justify-center">
            <Link
              href="/industries"
              className="group inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-200 transition hover:-translate-y-0.5 hover:text-slate-900 hover:ring-slate-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              See all six industries
              <ArrowRight className="h-4 w-4 text-emerald-600 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </Reveal>
      </Section>

      <Section tone="wash">
        <div className="grid items-center gap-8 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <SectionHeading
              eyebrow="Under the hood"
              title="What every build is standing on"
              description="The same stack behind each workspace above — no unofficial bridges, no per-customer forks."
            />
            <Reveal delay={140}>
              <p className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white/80 px-4 py-2.5 text-xs text-slate-600 shadow-sm ring-1 ring-inset ring-slate-900/5 backdrop-blur">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                Every workspace runs on the official Meta WhatsApp Business Cloud API.
              </p>
            </Reveal>
          </div>

          <Stage>
            <ul className="grid gap-2 sm:grid-cols-2">
              {STACK.map((item, i) => (
                <li
                  key={item}
                  style={stagger(i, 50)}
                  className="wa-lift rounded-xl bg-white/80 px-4 py-3 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-inset ring-slate-900/5 backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:ring-emerald-500/25"
                >
                  {item}
                </li>
              ))}
            </ul>
          </Stage>
        </div>
      </Section>

      <PageCta
        title="Want a build like one of these?"
        description="Tell us how your team sells and we will map it onto a workspace before you pay for anything."
        secondary={{ label: "Talk to us", href: "/contact" }}
      />
    </div>
  );
}
