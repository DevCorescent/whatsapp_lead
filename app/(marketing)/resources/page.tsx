import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  BookOpen,
  Braces,
  Building2,
  HelpCircle,
  LifeBuoy,
  Map,
  Newspaper,
  Rocket,
  Shapes,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { PageCta, PageHero, Section } from "@/components/marketing/PageShell";
import { Reveal, SectionHeading, Stage } from "@/components/marketing/home/primitives";
import { stagger } from "@/components/marketing/home/motion";
import { ArticleCard } from "@/components/marketing/blog/ArticleCard";
import { listPosts } from "@/components/marketing/blog/posts";

export const metadata: Metadata = {
  title: "Resources — WhatsCRM",
  description:
    "Everything for learning, launching and building on WhatsCRM: guides, the blog, API documentation, industry playbooks, FAQs and support.",
};

/**
 * The resource hub.
 *
 * A HUB, NOT A LIBRARY. Nothing here is authored twice — every card points at a page
 * that already owns the content (the blog, /features, /api-docs, the homepage FAQ).
 * The value of this page is the map, so it is short enough to read as one: four
 * destination cards, three getting-started links, three latest articles, and support.
 *
 * The latest articles are read straight from the blog's own `listPosts()`, which is
 * already sorted newest first. Slicing it here means a new post appears on this page
 * without anyone remembering to update it.
 */

const DESTINATIONS: {
  Icon: LucideIcon;
  title: string;
  body: string;
  href: string;
  cta: string;
}[] = [
  {
    Icon: Newspaper,
    title: "Blog",
    body: "Guides on WhatsApp templates, AI replies, lead qualification and running a pipeline on the Cloud API.",
    href: "/blog",
    cta: "Read the blog",
  },
  {
    Icon: Terminal,
    title: "WhatsCRM API",
    body: "Authentication, sending messages, webhooks and rate limits — the developer landing page and quickstart.",
    href: "/api-docs",
    cta: "Open the docs",
  },
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
    body: "How teams in six sectors configure a workspace — documents, flows, scoring and routing.",
    href: "/industries",
    cta: "Pick your industry",
  },
];

const START_HERE: { Icon: LucideIcon; title: string; body: string; href: string }[] = [
  {
    Icon: Rocket,
    title: "Get started in an evening",
    body: "Connect a number, upload one document, and let the AI take the first reply.",
    href: "/register",
  },
  {
    Icon: Shapes,
    title: "See the six-step workflow",
    body: "Message in, AI reply, qualification, score, pipeline — the whole path in one screen.",
    href: "/#how-it-works",
  },
  {
    Icon: BookOpen,
    title: "Understand every feature",
    body: "Shared inbox, knowledge base, flows, campaigns, analytics — with what each one does.",
    href: "/features",
  },
];

const SUPPORT: { Icon: LucideIcon; title: string; body: string; href: string; cta: string }[] = [
  {
    Icon: HelpCircle,
    title: "Frequently asked questions",
    body: "Pricing, Meta approval, message limits and what happens when the AI is unsure.",
    href: "/#faq",
    cta: "Read the FAQ",
  },
  {
    Icon: LifeBuoy,
    title: "Talk to a human",
    body: "Setup help, a walkthrough of your own use case, or a question about a plan.",
    href: "/contact",
    cta: "Contact support",
  },
  {
    Icon: Map,
    title: "Site map",
    body: "Every page on this site in one list, grouped by what it is for.",
    href: "/site-map",
    cta: "Open the site map",
  },
];

export default function ResourcesPage() {
  const latest = listPosts().slice(0, 3);

  return (
    <div>
      <PageHero
        eyebrow="Resources"
        title="Everything you need to learn it, launch it and build on it"
        description="Guides, documentation, industry playbooks and support — with a map of where each one lives so you are never more than a click from the right page."
        primaryCta={{ label: "Start Free Trial", href: "/register" }}
        secondaryCta={{ label: "Read the blog", href: "/blog" }}
      />

      <Section tone="soft" glow>
        <SectionHeading
          align="center"
          eyebrow="Where to go"
          title="Four places worth bookmarking"
        />

        <Stage className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {DESTINATIONS.map((item, i) => (
            <Link
              key={item.title}
              href={item.href}
              style={stagger(i, 65)}
              className="wa-lift wa-hover-lift group flex h-full flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-inset ring-slate-900/5 hover:shadow-lg hover:shadow-emerald-900/5 hover:ring-emerald-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              <span className="wa-icon-tilt flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-600/15 transition-colors duration-300 group-hover:bg-emerald-600 group-hover:ring-emerald-600">
                <item.Icon className="h-5 w-5 text-emerald-600 transition-colors duration-300 group-hover:text-white" />
              </span>
              <h2 className="mt-4 text-base font-bold tracking-tight text-slate-900">
                {item.title}
              </h2>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-600">{item.body}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                {item.cta}
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </Stage>
      </Section>

      <Section tone="plain">
        <SectionHeading
          align="center"
          eyebrow="Start here"
          title="New to WhatsCRM? Three links, in order"
        />
        <Stage className="mt-8 grid gap-3 sm:grid-cols-3">
          {START_HERE.map((item, i) => (
            <Link
              key={item.title}
              href={item.href}
              style={stagger(i, 80)}
              className="wa-lift group relative flex h-full items-start gap-3 overflow-hidden rounded-2xl bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm ring-1 ring-inset ring-slate-900/5 transition duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-emerald-900/5 hover:ring-emerald-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              <span className="nums mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-bold tracking-tight text-slate-900">
                  {item.title}
                  <ArrowRight className="h-3.5 w-3.5 text-emerald-600 transition-transform duration-200 group-hover:translate-x-0.5" />
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-slate-600">
                  {item.body}
                </span>
              </span>
            </Link>
          ))}
        </Stage>
      </Section>

      <Section tone="wash">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            eyebrow="Latest from the blog"
            title="Three things worth reading this month"
          />
          <Reveal delay={120}>
            <Link
              href="/blog"
              className="group inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 transition hover:text-emerald-800"
            >
              All articles
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </Reveal>
        </div>

        <Stage className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {latest.map((post, i) => (
            <div key={post.slug} style={stagger(i, 80)} className="wa-lift">
              <ArticleCard post={post} />
            </div>
          ))}
        </Stage>
      </Section>

      <Section tone="plain">
        <SectionHeading align="center" eyebrow="Support" title="When you would rather just ask" />
        <Stage className="mt-8 grid gap-3 sm:grid-cols-3">
          {SUPPORT.map((item, i) => (
            <Link
              key={item.title}
              href={item.href}
              style={stagger(i, 80)}
              className="wa-lift wa-hover-lift group flex h-full flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-inset ring-slate-900/5 hover:shadow-lg hover:shadow-emerald-900/5 hover:ring-emerald-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              <span className="wa-icon-tilt flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-600/15 transition-colors duration-300 group-hover:bg-emerald-600 group-hover:ring-emerald-600">
                <item.Icon className="h-4 w-4 text-emerald-600 transition-colors duration-300 group-hover:text-white" />
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
        title="Read enough? Try it on your own number."
        description="Free trial, no card required. The first automated reply takes about ten minutes to set up."
        secondary={{ label: "Talk to us", href: "/contact" }}
      />
    </div>
  );
}
