import Link from "next/link";
import type { Metadata } from "next";
import { ArrowUpRight, type LucideIcon, Building2, FileText, LogIn, Sparkles, Terminal } from "lucide-react";
import { PageCta, PageHero, Section } from "@/components/marketing/PageShell";
import { Stage } from "@/components/marketing/home/primitives";
import { stagger } from "@/components/marketing/home/motion";
import { listPosts } from "@/components/marketing/blog/posts";
import { INDUSTRIES } from "@/components/marketing/industries";

export const metadata: Metadata = {
  title: "Site Map — WhatsCRM",
  description:
    "Every page on the WhatsCRM website in one list: product, company, developer, legal and account pages, plus every industry page and blog article.",
};

/**
 * The site map.
 *
 * IT HAS TO BE ACTUALLY COMPLETE, or it is worse than nothing — a site map that omits
 * pages teaches a visitor not to trust it, and it is the one page whose entire value
 * is being exhaustive.
 *
 * So the two lists that grow on their own are generated rather than typed: industry
 * pages come from `INDUSTRIES` and articles from `listPosts()`, both of which are the
 * same sources those pages render from. A new article appears here the moment it is
 * published, with nobody remembering to add it.
 *
 * The static groups are hand-listed because they are the routes themselves, and there
 * is no route manifest to read at build time in the App Router.
 */

type Entry = { label: string; href: string; note?: string };
type Group = { Icon: LucideIcon; title: string; entries: Entry[] };

const GROUPS: Group[] = [
  {
    Icon: Sparkles,
    title: "Product",
    entries: [
      { label: "Home", href: "/", note: "The product in ninety seconds" },
      { label: "Features", href: "/features", note: "Six surfaces, in detail" },
      { label: "Solutions", href: "/solutions", note: "Organised by the problem" },
      { label: "Industry", href: "/industries", note: "Six sectors" },
      { label: "Pricing", href: "/pricing", note: "Plans and comparison" },
      { label: "Portfolio", href: "/portfolio", note: "What we have built" },
      { label: "Resources", href: "/resources", note: "Guides, docs and support" },
    ],
  },
  {
    Icon: Building2,
    title: "Company",
    entries: [
      { label: "About Us", href: "/about", note: "Who builds WhatsCRM" },
      { label: "Why Choose Us", href: "/why-choose-us", note: "Six reasons, with mechanisms" },
      { label: "Career", href: "/careers", note: "Open roles and how we hire" },
      { label: "Contact", href: "/contact", note: "Email, phone and the form" },
    ],
  },
  {
    Icon: Terminal,
    title: "Developers",
    entries: [
      { label: "WhatsCRM API", href: "/api-docs", note: "Quickstart and concepts" },
      { label: "API Reference", href: "/api-reference", note: "Every endpoint" },
      { label: "Blog", href: "/blog", note: "Guides and product news" },
      { label: "Site Map", href: "/site-map", note: "This page" },
    ],
  },
  {
    Icon: FileText,
    title: "Legal",
    entries: [
      { label: "Privacy Policy", href: "/privacy-policy" },
      { label: "Terms & Conditions", href: "/terms" },
      { label: "Refund Policy", href: "/refund-policy" },
      { label: "Security", href: "/security" },
      { label: "Cookies", href: "/cookies" },
    ],
  },
  {
    Icon: LogIn,
    title: "Account",
    entries: [
      { label: "Log in", href: "/login" },
      { label: "Start Free Trial", href: "/register" },
      { label: "Forgot password", href: "/forgot-password" },
    ],
  },
];

export default function SiteMapPage() {
  const posts = listPosts();

  return (
    <div>
      <PageHero
        eyebrow="Site map"
        title="Every page on this site, in one list"
        description="Five groups of pages, plus every industry page and every article. If something is published, it is linked from here."
        primaryCta={{ label: "Back to home", href: "/" }}
        secondaryCta={{ label: "Contact us", href: "/contact" }}
      />

      <Section tone="soft" glow>
        <Stage className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GROUPS.map((group, i) => (
            <div
              key={group.title}
              style={stagger(i, 70)}
              className="wa-lift h-full rounded-2xl bg-white p-6 shadow-sm ring-1 ring-inset ring-slate-900/5 transition duration-300 hover:shadow-lg hover:shadow-emerald-900/5 hover:ring-emerald-500/20"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 ring-1 ring-inset ring-emerald-600/15">
                  <group.Icon className="h-4 w-4 text-emerald-600" aria-hidden />
                </span>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                  {group.title}
                </h2>
              </div>

              <ul className="mt-4 space-y-2.5">
                {group.entries.map((entry) => (
                  <li key={entry.href + entry.label}>
                    <Link
                      href={entry.href}
                      className="group/link block rounded-lg px-2 py-1.5 -mx-2 transition-colors duration-200 hover:bg-emerald-50/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                    >
                      <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800 transition-colors duration-200 group-hover/link:text-emerald-700">
                        {entry.label}
                        <ArrowUpRight className="h-3 w-3 opacity-0 transition-opacity duration-200 group-hover/link:opacity-100" />
                      </span>
                      {entry.note && (
                        <span className="mt-0.5 block text-xs text-slate-500">{entry.note}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Stage>
      </Section>

      <Section tone="plain">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900">Industry pages</h2>
            <p className="mt-1 text-sm text-slate-600">
              All six live on <Link href="/industries" className="font-medium text-emerald-700 hover:text-emerald-800">/industries</Link>, each with its own section anchor.
            </p>
            <Stage className="mt-5 grid gap-2 sm:grid-cols-2">
              {INDUSTRIES.map((industry, i) => (
                <Link
                  key={industry.id}
                  href={`/industries#${industry.id}`}
                  style={stagger(i, 50)}
                  className="wa-lift group flex items-center gap-2.5 rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-900/5 transition duration-300 hover:-translate-y-0.5 hover:bg-white hover:text-emerald-700 hover:ring-emerald-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                >
                  <industry.Icon className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                  {industry.name}
                </Link>
              ))}
            </Stage>
          </div>

          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900">
              Articles ({posts.length})
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Generated from the blog itself, so a new post appears here on publish.
            </p>
            <Stage className="mt-5 space-y-1.5">
              {posts.map((post, i) => (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  style={stagger(i, 35)}
                  className="wa-lift group flex items-baseline justify-between gap-4 rounded-xl px-3 py-2 transition-colors duration-200 hover:bg-emerald-50/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                >
                  <span className="min-w-0 truncate text-sm font-medium text-slate-800 transition-colors duration-200 group-hover:text-emerald-700">
                    {post.title}
                  </span>
                  <time
                    dateTime={post.isoDate}
                    className="nums shrink-0 text-xs text-slate-400"
                  >
                    {post.date}
                  </time>
                </Link>
              ))}
            </Stage>
          </div>
        </div>
      </Section>

      <PageCta
        title="Found what you were looking for?"
        description="If a page is missing from this list, tell us — a site map with a gap in it is a bug."
        secondary={{ label: "Report it", href: "/contact" }}
      />
    </div>
  );
}
