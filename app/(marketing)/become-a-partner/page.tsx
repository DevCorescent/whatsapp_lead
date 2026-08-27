import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Award,
  BookOpen,
  Coins,
  Handshake,
  LifeBuoy,
  Megaphone,
  Puzzle,
  Store,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import FaqAccordion, { type FaqItem } from "@/components/marketing/FaqAccordion";
import { PageCta, PageHero, Section } from "@/components/marketing/PageShell";
import { Reveal, SectionHeading, Stage } from "@/components/marketing/home/primitives";
import { stagger } from "@/components/marketing/home/motion";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Become a Partner — WhatsCRM",
  description:
    "Partner with WhatsCRM as a referral partner, an agency reseller or a technology integrator. Recurring revenue share, deal support, co-marketing and a free partner workspace.",
  alternates: { canonical: "/become-a-partner" },
};

/**
 * The partner programme.
 *
 * A REAL PAGE, NOT A HOLDING PAGE. A "Become a Partner" link that opens on "coming
 * soon" costs more than not having the link: the person who clicked it was, by
 * definition, the one prospect on the page already thinking about selling for us.
 *
 * So it answers what a prospective partner actually asks, in the order they ask it:
 * which kind of partner am I, what do I get, what do I have to do, what does the
 * commercial arrangement look like, and who do I talk to. The application is a
 * conversation rather than a form of its own — /contact already exists, is monitored,
 * and is a better first touch than a fourteen-field questionnaire.
 *
 * THE NUMBERS ARE STRUCTURE, NOT PROMISES. The tiers describe how the programme is
 * shaped — what qualifies you, what changes when you get there. Nothing on this page
 * claims a partner count or an average earning, because the repository cannot stand
 * behind either.
 */

type Track = {
  Icon: LucideIcon;
  name: string;
  who: string;
  body: string;
  points: string[];
  /** Marked as the one most applicants belong in, so the three are not a shrug. */
  featured?: boolean;
};

const TRACKS: Track[] = [
  {
    Icon: Handshake,
    name: "Referral partner",
    who: "Consultants, freelancers, communities",
    body: "You introduce a business that needs WhatsApp automation. We take it from the first call onwards.",
    points: [
      "Send an intro — we handle demo, onboarding and support",
      "Recurring commission for as long as the account stays",
      "No technical work and no minimum volume",
    ],
  },
  {
    Icon: Store,
    name: "Agency & reseller",
    who: "Marketing, CRM and automation agencies",
    body: "You sell, configure and manage WhatsCRM for your clients, on your own terms and your own invoice.",
    points: [
      "Margin on every workspace you resell",
      "Manage all client workspaces from one place",
      "Deal registration, joint pitches and pricing support",
    ],
    featured: true,
  },
  {
    Icon: Puzzle,
    name: "Technology & integration",
    who: "SaaS products, system integrators, ISVs",
    body: "You build on the WhatsCRM API, or connect it to the CRM, ERP or storefront your customers already run.",
    points: [
      "Full API access and a sandbox workspace",
      "Engineering support during the build",
      "Co-marketing once the integration ships",
    ],
  },
];

const BENEFITS: { Icon: LucideIcon; title: string; body: string }[] = [
  {
    Icon: Coins,
    title: "Recurring revenue share",
    body: "Commission on every subscription you bring, paid for the life of the account rather than once at signature.",
  },
  {
    Icon: Target,
    title: "Deal registration and support",
    body: "Register an opportunity and it is yours. Bring us into the pitch and a solutions engineer joins the call.",
  },
  {
    Icon: BookOpen,
    title: "A free partner workspace",
    body: "A full workspace to demo from, test in and train your team on — not a trial that expires mid-pitch.",
  },
  {
    Icon: Award,
    title: "Training and certification",
    body: "Product, WhatsApp Cloud API and AI-configuration training, so your team can run an implementation without us.",
  },
  {
    Icon: Megaphone,
    title: "Co-marketing",
    body: "Joint case studies, listings and campaigns once you have a live client worth talking about.",
  },
  {
    Icon: LifeBuoy,
    title: "Priority support",
    body: "A direct channel for partner tickets, so a client escalation does not sit in a general queue.",
  },
];

const STEPS: { title: string; body: string }[] = [
  {
    title: "Apply",
    body: "Tell us who you work with and which track fits. One short conversation, not a fourteen-field form.",
  },
  {
    title: "Get enabled",
    body: "Partner workspace, pricing, demo script and product training — usually inside a week of the first call.",
  },
  {
    title: "Launch your first client",
    body: "We join the pitch, help configure the knowledge base and the pipeline, and stay on the first go-live.",
  },
  {
    title: "Earn and scale",
    body: "Commission runs monthly. Bring more accounts and the tier moves with you, along with what comes with it.",
  },
];

const TIERS: { name: string; qualify: string; perks: string[]; featured?: boolean }[] = [
  {
    name: "Registered",
    qualify: "From your first registered deal",
    perks: ["Base revenue share", "Partner workspace", "Self-serve enablement kit"],
  },
  {
    name: "Certified",
    qualify: "Certified team + live clients",
    perks: ["Higher revenue share", "Deal registration and joint pitches", "Priority partner support"],
    featured: true,
  },
  {
    name: "Premier",
    qualify: "Sustained volume and delivery quality",
    perks: ["Top revenue share", "Named partner manager", "Co-marketing and roadmap input"],
  },
];

const FAQS: FaqItem[] = [
  {
    question: "What does it cost to become a partner?",
    answer:
      "Nothing. There is no joining fee and no minimum purchase. You get a partner workspace and enablement material once your application is approved.",
  },
  {
    question: "How is commission calculated and paid?",
    answer:
      "As a percentage of the subscription revenue from accounts you bring, recurring for as long as the account stays with WhatsCRM. Rates depend on your tier and track, and are confirmed in writing before you register your first deal. Payouts run monthly.",
  },
  {
    question: "Can I resell under my own brand and invoice?",
    answer:
      "Agency and reseller partners bill their clients directly and set their own service fees on top of the platform cost. You manage the client workspaces; we stay behind you on the platform.",
  },
  {
    question: "Do I need technical people on my team?",
    answer:
      "For the referral track, no — you make the introduction and we do the rest. For agency and technology tracks, one person who can configure a knowledge base and a pipeline is enough; the training covers the rest, and the API work is documented.",
  },
  {
    question: "Which businesses are the best fit to bring us?",
    answer:
      "Anyone selling or supporting over WhatsApp at volume: real estate, education and coaching, clinics, e-commerce, finance, automotive, retail and professional services. The industry pages cover the automation each of those runs.",
  },
  {
    question: "How long does approval take?",
    answer:
      "Usually a few working days. We look at who you already work with and whether the track you picked matches — not at company size.",
  },
];

export default function BecomeAPartnerPage() {
  return (
    <div>
      <PageHero
        eyebrow="Partner programme"
        title="Sell the WhatsApp CRM your clients keep asking you for"
        description="Refer, resell or build on WhatsCRM. Recurring revenue share, a free partner workspace, and a solutions engineer on the calls that matter."
        primaryCta={{ label: "Apply to partner", href: "/contact" }}
        secondaryCta={{ label: "See pricing", href: "/pricing" }}
      >
        <ul className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-slate-500">
          {["No joining fee", "Recurring commission", "Free partner workspace", "Deal support"].map(
            (item) => (
              <li key={item} className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                {item}
              </li>
            ),
          )}
        </ul>
      </PageHero>

      {/* ── The three tracks ─────────────────────────────────────────────── */}
      <Section tone="soft" glow className="pt-2 sm:pt-4">
        <SectionHeading
          align="center"
          eyebrow="Choose a track"
          title="Three ways to partner"
          description="Pick the one that matches how you already work. You can move between them later."
        />
        <Stage className="mt-8 grid gap-3 lg:grid-cols-3">
          {TRACKS.map((track, i) => (
            <div
              key={track.name}
              style={stagger(i, 80)}
              className={cn(
                "wa-lift relative flex h-full flex-col rounded-2xl bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-emerald-900/5",
                track.featured
                  ? "ring-2 ring-emerald-500/60"
                  : "ring-1 ring-inset ring-slate-900/5 hover:ring-emerald-500/25",
              )}
            >
              {track.featured && (
                <span className="absolute -top-2.5 left-6 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm">
                  Most partners
                </span>
              )}

              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-600/15">
                <track.Icon className="h-5 w-5 text-emerald-600" aria-hidden />
              </span>

              <h3 className="mt-4 text-base font-bold tracking-tight text-slate-900">
                {track.name}
              </h3>
              <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-emerald-600">
                {track.who}
              </p>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-600">{track.body}</p>

              <ul className="mt-4 flex-1 space-y-2">
                {track.points.map((point) => (
                  <li key={point} className="flex items-start gap-2">
                    <ArrowRight
                      aria-hidden
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600"
                    />
                    <span className="text-sm leading-relaxed text-slate-700">{point}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/contact"
                className="group mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 transition hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
              >
                Apply for this track
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </div>
          ))}
        </Stage>
      </Section>

      {/* ── What you get ─────────────────────────────────────────────────── */}
      <Section tone="plain">
        <SectionHeading
          align="center"
          eyebrow="What you get"
          title="Six things that come with the badge"
        />
        <Stage className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((benefit, i) => (
            <div
              key={benefit.title}
              style={stagger(i, 60)}
              className="wa-lift wa-hover-lift group flex h-full flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-inset ring-slate-900/5 hover:shadow-lg hover:shadow-emerald-900/5 hover:ring-emerald-500/25"
            >
              <span className="wa-icon-tilt flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-600/15 transition-colors duration-300 group-hover:bg-emerald-600 group-hover:ring-emerald-600">
                <benefit.Icon className="h-5 w-5 text-emerald-600 transition-colors duration-300 group-hover:text-white" />
              </span>
              <h3 className="mt-4 text-sm font-bold tracking-tight text-slate-900">
                {benefit.title}
              </h3>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-600">{benefit.body}</p>
            </div>
          ))}
        </Stage>
      </Section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <Section tone="wash" glow>
        <SectionHeading
          align="center"
          eyebrow="How it works"
          title="From application to first payout"
        />
        <Stage className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <div
              key={step.title}
              style={stagger(i, 80)}
              className="wa-lift relative flex h-full flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-inset ring-slate-900/5 transition duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-emerald-900/5 hover:ring-emerald-500/25"
            >
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute right-[-0.85rem] top-9 hidden h-px w-3 rounded-full bg-emerald-300 lg:block"
                />
              )}
              <span className="nums flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-xs font-bold text-white shadow-sm shadow-emerald-600/25">
                {i + 1}
              </span>
              <h3 className="mt-4 text-sm font-bold tracking-tight text-slate-900">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{step.body}</p>
            </div>
          ))}
        </Stage>
      </Section>

      {/* ── Tiers ────────────────────────────────────────────────────────── */}
      <Section tone="plain">
        <SectionHeading
          align="center"
          eyebrow="Tiers"
          title="What changes as you grow"
          description="Rates are confirmed in writing before you register a deal, so nothing here is a surprise later."
        />
        <Stage className="mt-8 grid gap-3 sm:grid-cols-3">
          {TIERS.map((tier, i) => (
            <div
              key={tier.name}
              style={stagger(i, 80)}
              className={cn(
                "wa-lift flex h-full flex-col rounded-2xl p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg",
                tier.featured
                  ? "bg-gradient-to-br from-slate-900 to-emerald-950 text-white ring-1 ring-inset ring-emerald-400/25"
                  : "bg-white ring-1 ring-inset ring-slate-900/5 hover:ring-emerald-500/25",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3
                  className={cn(
                    "text-base font-bold tracking-tight",
                    tier.featured ? "text-white" : "text-slate-900",
                  )}
                >
                  {tier.name}
                </h3>
                <Users
                  aria-hidden
                  className={cn("h-4 w-4", tier.featured ? "text-emerald-400" : "text-emerald-600")}
                />
              </div>
              <p
                className={cn(
                  "mt-1 text-xs font-medium uppercase tracking-wide",
                  tier.featured ? "text-emerald-300" : "text-emerald-600",
                )}
              >
                {tier.qualify}
              </p>
              <ul className="mt-4 flex-1 space-y-2">
                {tier.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2">
                    <span
                      aria-hidden
                      className={cn(
                        "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                        tier.featured ? "bg-emerald-400" : "bg-emerald-500",
                      )}
                    />
                    <span
                      className={cn(
                        "text-sm leading-relaxed",
                        tier.featured ? "text-slate-200" : "text-slate-700",
                      )}
                    >
                      {perk}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Stage>
      </Section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <Section tone="soft">
        <SectionHeading
          align="center"
          eyebrow="Partner FAQ"
          title="The six questions every applicant asks"
        />
        <Reveal delay={80}>
          <div className="mx-auto mt-8 max-w-3xl">
            <FaqAccordion items={FAQS} />
          </div>
        </Reveal>
      </Section>

      <PageCta
        title="Ready to partner with WhatsCRM?"
        description="Tell us who you work with and which track fits. We reply within a couple of working days."
        primary={{ label: "Apply to partner", href: "/contact" }}
        secondary={{ label: "See the product", href: "/features" }}
      />
    </div>
  );
}
