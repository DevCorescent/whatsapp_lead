import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Bot,
  Braces,
  Building2,
  LifeBuoy,
  MessageSquare,
  Rocket,
  ShieldCheck,
  Terminal,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { PageCta, PageHero, Section } from "@/components/marketing/PageShell";
import { Reveal, SectionHeading, Stage } from "@/components/marketing/home/primitives";
import { stagger } from "@/components/marketing/home/motion";
import { ArticleCard } from "@/components/marketing/blog/ArticleCard";
import { listPosts } from "@/components/marketing/blog/posts";

export const metadata: Metadata = {
  title: "Documentation — WhatsCRM",
  description:
    "WhatsCRM documentation: connect a WhatsApp number, teach the AI from your own documents, run a shared inbox and a lead pipeline, send campaigns, and build on the API.",
  alternates: { canonical: "/documentation" },
};

/**
 * The documentation landing page.
 *
 * WHAT THIS IS. The front door of the docs, in the shape docs front doors take: a
 * three-step quickstart, then six topic areas each opening onto the pages that hold
 * the detail, then the written guides, then a way to ask a person. Someone arriving
 * from the footer link should be able to find the page they want without reading
 * anything on this one.
 *
 * EVERY LINK RESOLVES. Nothing here points at a topic that has not been written yet —
 * the topic entries deep-link into the six anchored sections of /features, the six of
 * /solutions, the two API pages and the blog, all of which exist. A documentation
 * index whose links 404 is worse than no index, because it teaches people the docs are
 * unfinished.
 *
 * AND NOTHING IS AUTHORED TWICE. The guide cards are read straight from the blog's own
 * `listPosts()`, already sorted newest first, so a new article appears here on publish
 * with nobody remembering to add it. That is the same arrangement /resources uses; the
 * difference between the two pages is audience — /resources is a map of the marketing
 * site, this is a map of how to operate the product.
 */

type DocLink = { label: string; href: string };
type Topic = {
  Icon: LucideIcon;
  title: string;
  body: string;
  links: DocLink[];
};

const QUICKSTART: { Icon: LucideIcon; title: string; body: string; href: string; cta: string }[] = [
  {
    Icon: Rocket,
    title: "Create your workspace",
    body: "Sign up, name your business and pick a plan. The free trial needs no card and takes about a minute.",
    href: "/register",
    cta: "Start free trial",
  },
  {
    Icon: MessageSquare,
    title: "Connect your WhatsApp number",
    body: "WhatsCRM runs on the official Meta Cloud API. Register the number, verify the business, send a test message.",
    href: "/api-docs",
    cta: "Read the setup guide",
  },
  {
    Icon: Bot,
    title: "Teach the AI and turn it on",
    body: "Upload a price list, a policy or a brochure. The AI answers from those documents and cites the one it used.",
    href: "/features#knowledge-base",
    cta: "Knowledge base",
  },
];

const TOPICS: Topic[] = [
  {
    Icon: BookOpen,
    title: "Getting started",
    body: "Workspace setup, your team, and what each plan includes.",
    links: [
      { label: "Create a workspace", href: "/register" },
      { label: "Invite your team", href: "/features#shared-inbox" },
      { label: "Plans and limits", href: "/pricing" },
      { label: "Common questions", href: "/#faq" },
    ],
  },
  {
    Icon: MessageSquare,
    title: "WhatsApp setup",
    body: "The Cloud API, number registration, templates and webhooks.",
    links: [
      { label: "Cloud API quickstart", href: "/api-docs" },
      { label: "Message templates", href: "/features#campaigns" },
      { label: "Webhooks and delivery", href: "/api-reference" },
      { label: "Meta approval FAQ", href: "/#faq" },
    ],
  },
  {
    Icon: Bot,
    title: "AI and knowledge base",
    body: "How replies are generated, grounded, cited and handed over.",
    links: [
      { label: "Upload documents", href: "/features#knowledge-base" },
      { label: "How auto-reply works", href: "/features#ai-auto-reply" },
      { label: "Replying instantly, 24×7", href: "/solutions#reply-instantly" },
      { label: "When the AI is unsure", href: "/solutions#support-at-scale" },
    ],
  },
  {
    Icon: TrendingUp,
    title: "Inbox, leads and pipeline",
    body: "One number for the whole team, and a CRM that fills itself in.",
    links: [
      { label: "The shared inbox", href: "/features#shared-inbox" },
      { label: "Lead scoring and stages", href: "/features#lead-pipeline" },
      { label: "Qualification criteria", href: "/solutions#qualify-every-lead" },
      { label: "Assignment and ownership", href: "/solutions#never-lose-a-lead" },
    ],
  },
  {
    Icon: BarChart3,
    title: "Campaigns and analytics",
    body: "Broadcasting to a segment, and reading what it produced.",
    links: [
      { label: "Run a campaign", href: "/features#campaigns" },
      { label: "Scaling outreach", href: "/solutions#scale-outreach" },
      { label: "Reports and dashboards", href: "/features#analytics" },
      { label: "Knowing what works", href: "/solutions#know-what-works" },
    ],
  },
  {
    Icon: Terminal,
    title: "Developers",
    body: "Authentication, endpoints, payload shapes and rate limits.",
    links: [
      { label: "API quickstart", href: "/api-docs" },
      { label: "Endpoint reference", href: "/api-reference" },
      { label: "Security and data handling", href: "/security" },
      { label: "Build on the platform", href: "/api-docs" },
    ],
  },
];

const HELP: { Icon: LucideIcon; title: string; body: string; href: string; cta: string }[] = [
  {
    Icon: Braces,
    title: "API reference",
    body: "Every endpoint, its parameters, its response shape and the errors it can return.",
    href: "/api-reference",
    cta: "Browse endpoints",
  },
  {
    Icon: Building2,
    title: "Industry playbooks",
    body: "How teams in eight sectors configure documents, flows, scoring and routing.",
    href: "/industries",
    cta: "Pick your industry",
  },
  {
    Icon: ShieldCheck,
    title: "Security and compliance",
    body: "Where data lives, who can reach it, and what the Cloud API does and does not allow.",
    href: "/security",
    cta: "Read the details",
  },
  {
    Icon: LifeBuoy,
    title: "Talk to a human",
    body: "Setup help, a walkthrough of your own use case, or a question a page did not answer.",
    href: "/contact",
    cta: "Contact support",
  },
];

export default function DocumentationPage() {
  const guides = listPosts().slice(0, 3);

  return (
    <div>
      <PageHero
        eyebrow="Documentation"
        title="Set it up, teach it, and let it run"
        description="Connect a WhatsApp number, ground the AI in your own documents, and put every conversation into a pipeline. Start with the three steps below, then go as deep as you need."
        primaryCta={{ label: "Start Free Trial", href: "/register" }}
        secondaryCta={{ label: "API documentation", href: "/api-docs" }}
      />

      {/* ── Quickstart ───────────────────────────────────────────────────── */}
      <Section tone="soft" glow className="pt-2 sm:pt-4">
        <SectionHeading
          align="center"
          eyebrow="Quickstart"
          title="Three steps to your first automated reply"
        />
        <Stage className="mt-8 grid gap-3 sm:grid-cols-3">
          {QUICKSTART.map((step, i) => (
            <Link
              key={step.title}
              href={step.href}
              style={stagger(i, 80)}
              className="wa-lift group flex h-full flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-inset ring-slate-900/5 transition duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-emerald-900/5 hover:ring-emerald-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              <span className="flex items-center gap-2.5">
                <span className="nums flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <step.Icon className="h-4 w-4 text-emerald-600" aria-hidden />
              </span>
              <h3 className="mt-4 text-sm font-bold tracking-tight text-slate-900">{step.title}</h3>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-600">{step.body}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                {step.cta}
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </Stage>
      </Section>

      {/* ── Topics ───────────────────────────────────────────────────────── */}
      <Section tone="plain">
        <SectionHeading
          align="center"
          eyebrow="Browse by topic"
          title="Six areas, and where each one is documented"
        />
        <Stage className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TOPICS.map((topic, i) => (
            <div
              key={topic.title}
              style={stagger(i, 60)}
              className="wa-lift flex h-full flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-inset ring-slate-900/5 transition duration-300 hover:shadow-lg hover:shadow-emerald-900/5 hover:ring-emerald-500/20"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-600/15">
                  <topic.Icon className="h-4 w-4 text-emerald-600" aria-hidden />
                </span>
                <h3 className="text-sm font-bold tracking-tight text-slate-900">{topic.title}</h3>
              </div>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-600">{topic.body}</p>

              <ul className="mt-4 space-y-1">
                {topic.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="group/link -mx-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-700 transition-colors duration-200 hover:bg-emerald-50/70 hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                    >
                      {link.label}
                      <ArrowUpRight
                        aria-hidden
                        className="h-3 w-3 opacity-0 transition-opacity duration-200 group-hover/link:opacity-100"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Stage>
      </Section>

      {/* ── Written guides ───────────────────────────────────────────────── */}
      <Section tone="wash">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            eyebrow="Guides"
            title="Longer walkthroughs, written out"
            description="Step-by-step articles for the jobs that take an afternoon rather than a minute."
          />
          <Reveal delay={120}>
            <Link
              href="/blog"
              className="group inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 transition hover:text-emerald-800"
            >
              All guides
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </Reveal>
        </div>

        <Stage className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {guides.map((post, i) => (
            <div key={post.slug} style={stagger(i, 80)} className="wa-lift">
              <ArticleCard post={post} />
            </div>
          ))}
        </Stage>
      </Section>

      {/* ── Everything else ──────────────────────────────────────────────── */}
      <Section tone="plain">
        <SectionHeading align="center" eyebrow="Also useful" title="Reference, and a way to ask" />
        <Stage className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {HELP.map((item, i) => (
            <Link
              key={item.title}
              href={item.href}
              style={stagger(i, 65)}
              className="wa-lift wa-hover-lift group flex h-full flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-inset ring-slate-900/5 hover:shadow-lg hover:shadow-emerald-900/5 hover:ring-emerald-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              <span className="wa-icon-tilt flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-600/15 transition-colors duration-300 group-hover:bg-emerald-600 group-hover:ring-emerald-600">
                <item.Icon className="h-5 w-5 text-emerald-600 transition-colors duration-300 group-hover:text-white" />
              </span>
              <h3 className="mt-4 text-sm font-bold tracking-tight text-slate-900">{item.title}</h3>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-600">{item.body}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                {item.cta}
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </Stage>
      </Section>

      <PageCta
        title="Read enough? Set it up on your own number."
        description="Free trial, no card required. The first automated reply takes about ten minutes to configure."
        secondary={{ label: "Talk to us", href: "/contact" }}
      />
    </div>
  );
}
