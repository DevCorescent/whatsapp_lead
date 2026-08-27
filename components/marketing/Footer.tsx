import Link from "next/link";
import { ArrowRight, MessageSquare, ShieldCheck, Sparkles, Zap } from "lucide-react";
import type { SVGProps } from "react";

/**
 * Marketing footer.
 *
 * EVERY LINK RESOLVES to a page that exists under app/(marketing) or app/(auth), or to
 * an anchor on the homepage. That is not a style preference: a footer link that 404s
 * is the kind of defect nobody reports, because everyone assumes it is deliberate.
 * Adding a column entry here means adding the `page.tsx` in the same change.
 *
 * THE SHAPE. A compact CTA rail, then brand plus four link columns, then a thin legal
 * bar. Five columns of links with no CTA reads as a sitemap; a full-width CTA panel
 * stacked on top of five columns makes the footer taller than most of the pages it
 * closes. The rail is the compromise — one line, one button, on the same dark
 * gradient rather than in a card of its own.
 *
 * COLUMN ORDER IS AUDIENCE ORDER: who we are, what we sell, how to build on it, what
 * you are agreeing to. Someone scanning left to right is narrowing, not wandering.
 *
 * The gradient runs navy → dark teal and matches the homepage's DarkBand, so the page
 * closes in the same register its centre was written in.
 */

const COMPANY_LINKS = [
  { label: "About Us", href: "/about" },
  { label: "Why Choose Us", href: "/why-choose-us" },
  { label: "Become a Partner", href: "/become-a-partner" },
  { label: "Career", href: "/careers" },
  { label: "Contact", href: "/contact" },
];

/**
 * Six items, and the API is deliberately not one of them.
 *
 * The API is a developer surface, not something a buyer scanning the Product column is
 * shopping for, and it already has two entries under Developers. Listing it in both
 * places made Product the longest column by two rows and said "API" three times in one
 * footer. It reaches /api-docs from Developers.
 */
const PRODUCT_LINKS = [
  { label: "Features", href: "/features" },
  { label: "Solutions", href: "/solutions" },
  { label: "Industry", href: "/industries" },
  { label: "Pricing", href: "/pricing" },
  { label: "Portfolio", href: "/portfolio" },
  { label: "Resources", href: "/resources" },
];

/**
 * Documentation leads, and the two API entries sit under it.
 *
 * "Documentation" is the door a non-developer is looking for — the how-do-I pages —
 * and /api-docs and /api-reference are what a developer is looking for once they are
 * through it. Listing the API first made this column read as a developers-only column,
 * which is not what the fourth column of a marketing footer is for.
 */
const DEVELOPER_LINKS = [
  { label: "Documentation", href: "/documentation" },
  { label: "API Docs", href: "/api-docs" },
  { label: "API Reference", href: "/api-reference" },
  { label: "Blog", href: "/blog" },
  { label: "Site Map", href: "/site-map" },
];

const LEGAL_LINKS = [
  { label: "Privacy Policy", href: "/privacy-policy" },
  { label: "Terms & Conditions", href: "/terms" },
  { label: "Refund Policy", href: "/refund-policy" },
  { label: "Security", href: "/security" },
  { label: "Cookies", href: "/cookies" },
];

const COLUMNS = [
  { heading: "Company", links: COMPANY_LINKS },
  { heading: "Product", links: PRODUCT_LINKS },
  { heading: "Developers", links: DEVELOPER_LINKS },
  { heading: "Legal", links: LEGAL_LINKS },
];

/** Three claims the repository can actually stand behind. No adoption figures. */
const TRUST = [
  { Icon: ShieldCheck, label: "Official Meta Cloud API" },
  { Icon: Sparkles, label: "AI grounded in your docs" },
  { Icon: Zap, label: "Free trial, no card" },
];

// lucide-react v1 no longer ships brand icons, so the social marks stay inline SVG.
function TwitterIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817-5.966 6.817H1.68l7.73-8.835L1.254 2.25h6.826l4.713 6.231 5.451-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

function LinkedInIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12Zm1.78 13.02H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0Z" />
    </svg>
  );
}

function FacebookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.09 24 18.1 24 12.07Z" />
    </svg>
  );
}

function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.8 3.8 0 0 1-1.38-.9 3.8 3.8 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41 1.27-.06 1.65-.07 4.85-.07ZM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.79.3-1.46.72-2.13 1.38A5.9 5.9 0 0 0 .63 4.14c-.3.76-.5 1.64-.56 2.91C.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.3.79.72 1.46 1.38 2.13a5.9 5.9 0 0 0 2.13 1.38c.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.9 5.9 0 0 0 2.13-1.38 5.9 5.9 0 0 0 1.38-2.13c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.9 5.9 0 0 0-1.38-2.13A5.9 5.9 0 0 0 19.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0Zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm7.85-10.41a1.44 1.44 0 1 1-2.88 0 1.44 1.44 0 0 1 2.88 0Z" />
    </svg>
  );
}

function YouTubeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.08 0 12 0 12s0 3.92.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.92 24 12 24 12s0-3.92-.5-5.81ZM9.55 15.57V8.43L15.82 12l-6.27 3.57Z" />
    </svg>
  );
}

const SOCIAL_LINKS = [
  { label: "Twitter", href: "https://twitter.com", Icon: TwitterIcon },
  { label: "LinkedIn", href: "https://linkedin.com", Icon: LinkedInIcon },
  { label: "Facebook", href: "https://facebook.com", Icon: FacebookIcon },
  { label: "Instagram", href: "https://instagram.com", Icon: InstagramIcon },
  { label: "YouTube", href: "https://youtube.com", Icon: YouTubeIcon },
];

export default function Footer() {
  return (
    <footer className="relative isolate overflow-hidden bg-[linear-gradient(185deg,#07231f_0%,#08202a_34%,#0b1a24_70%,#0a1120_100%)]">
      {/* The same four-layer treatment as the homepage's dark band — grid, two mesh
          washes, grain — but softer. The footer closes the page; it must not compete
          with it. */}
      <div
        aria-hidden
        className="wa-grid-dark pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_75%_70%_at_50%_0%,#000_30%,transparent_100%)]"
      />
      <div
        aria-hidden
        className="wa-drift pointer-events-none absolute -left-32 -top-24 h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(closest-side,rgba(16,185,129,0.18),transparent_100%)]"
      />
      <div
        aria-hidden
        className="wa-drift-slow pointer-events-none absolute -right-28 top-1/4 h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(closest-side,rgba(45,212,191,0.12),transparent_100%)]"
      />
      <div aria-hidden className="wa-noise pointer-events-none absolute inset-0 opacity-[0.03]" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent"
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* ── CTA rail ───────────────────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-4 border-b border-white/10 py-8 text-center sm:flex-row sm:justify-between sm:text-left lg:py-9">
          <div>
            <p className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              Ready to grow on WhatsApp?
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Connect your number and let the AI handle the first reply.
            </p>
          </div>
          <Link
            href="/register"
            className="group inline-flex shrink-0 items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition duration-300 hover:-translate-y-0.5 hover:bg-emerald-400 hover:shadow-xl hover:shadow-emerald-500/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
          >
            Start Free Trial
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* ── Brand + columns ────────────────────────────────────────────────── */}
        <div className="grid gap-10 py-10 lg:grid-cols-[1.15fr_2.85fr] lg:gap-12 lg:py-12">
          <div>
            <Link
              href="/"
              className="group inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 shadow-lg shadow-emerald-500/25 transition-transform duration-300 group-hover:scale-105">
                <MessageSquare className="h-4 w-4 text-slate-950" />
              </span>
              <span className="text-lg font-bold tracking-tight text-white">WhatsCRM</span>
            </Link>

            <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-400">
              An AI-powered WhatsApp CRM: one shared inbox, replies grounded in your own
              documents, and leads qualified before anyone opens the app.
            </p>

            <ul className="mt-5 space-y-2">
              {TRUST.map(({ Icon, label }) => (
                <li key={label} className="flex items-center gap-2 text-xs text-slate-400">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  {label}
                </li>
              ))}
            </ul>

            <ul className="mt-6 flex flex-wrap gap-2">
              {SOCIAL_LINKS.map(({ label, href, Icon }) => (
                <li key={label}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-400 transition duration-300 hover:-translate-y-0.5 hover:scale-105 hover:border-emerald-400/40 hover:bg-emerald-400/15 hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </a>
                </li>
              ))}
            </ul>

            <a
              href="mailto:support@whatscrm.in"
              className="wa-underline mt-5 inline-block text-sm text-slate-400 hover:text-emerald-400"
            >
              support@whatscrm.in
            </a>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
            {COLUMNS.map((column) => (
              <div key={column.heading}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white">
                  {column.heading}
                </h3>
                <span
                  aria-hidden
                  className="mt-2 block h-px w-6 rounded-full bg-gradient-to-r from-emerald-400/70 to-transparent"
                />
                <ul className="mt-3 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="wa-underline inline-block text-sm text-slate-400 hover:text-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* ── Legal bar ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col items-center justify-between gap-2 border-t border-white/10 py-6 sm:flex-row">
          <p className="text-center text-xs text-slate-500 sm:text-left">
            © WhatsCRM by Corescent Technologies Pvt Ltd. All rights reserved.
          </p>
          <p className="text-center text-xs text-slate-500 sm:text-right">
            Built on the official Meta WhatsApp Business Cloud API.
          </p>
        </div>
      </div>
    </footer>
  );
}
