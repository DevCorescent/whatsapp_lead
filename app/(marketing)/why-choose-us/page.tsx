import type { Metadata } from "next";
import {
  BadgeCheck,
  Blocks,
  BookOpen,
  Building2,
  Check,
  Lock,
  Minus,
  ShieldCheck,
  Sparkles,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { PageCta, PageHero, Section } from "@/components/marketing/PageShell";
import { Reveal, SectionHeading, Stage } from "@/components/marketing/home/primitives";
import { stagger } from "@/components/marketing/home/motion";

export const metadata: Metadata = {
  title: "Why Choose Us — WhatsCRM",
  description:
    "Why teams pick WhatsCRM: the official Meta Cloud API, AI grounded in your own documents, lead qualification that is built in rather than bolted on, and pricing in rupees.",
};

/**
 * Why Choose Us.
 *
 * THE HARD PART OF THIS PAGE is that it is the one most likely to be written as a
 * list of adjectives. "Powerful. Reliable. Trusted." says nothing, and a buyer
 * comparing three WhatsApp tools has read it on all three.
 *
 * So every reason here is a claim with a mechanism attached — the thing WhatsCRM does
 * differently, in one sentence, followed by why it matters. The comparison table names
 * categories of tool ("an unofficial API wrapper", "a generic CRM with a WhatsApp
 * plugin") rather than competitors by name: naming a competitor invites an argument
 * about their roadmap instead of a decision about ours, and the categories are what a
 * buyer is actually choosing between.
 *
 * NO ADOPTION FIGURES. There are none this repository can verify, and the fastest way
 * to lose a technical buyer is a statistic they can tell you invented.
 */

const REASONS: { Icon: LucideIcon; title: string; body: string }[] = [
  {
    Icon: ShieldCheck,
    title: "The official Meta Cloud API, not a workaround",
    body: "Your number is registered with Meta the way Meta intends. No QR-code bridge, no unofficial library, nothing that gets your number banned the week a policy changes.",
  },
  {
    Icon: BookOpen,
    title: "AI that reads your documents, not the internet",
    body: "Upload your price list, brochure or policy and the AI answers from it — and shows which file each answer came from. A chatbot that invents an answer costs more than one that says it does not know.",
  },
  {
    Icon: BadgeCheck,
    title: "Qualification is built in, not bolted on",
    body: "Budget, authority, need and timeline are read out of the conversation and turned into a 0–100 score automatically. Most tools give you an inbox and leave the scoring to a spreadsheet.",
  },
  {
    Icon: Blocks,
    title: "One workspace instead of four subscriptions",
    body: "Inbox, CRM, campaigns, flows, tickets and analytics are the same product with the same contact record. Nothing has to be synced, so nothing can be out of sync.",
  },
  {
    Icon: Wallet,
    title: "Priced in rupees, for Indian teams",
    body: "Plans start at ₹999 a month with a free trial that needs no card, and a 7-day refund window on your first paid charge. No annual lock-in to get a sensible price.",
  },
  {
    Icon: Lock,
    title: "Your workspace is yours",
    body: "Every workspace is isolated at the database level, data is encrypted at rest, and the contents of your conversations are never used to train any model — ours or anybody else's.",
  },
];

type Row = { feature: string; whatscrm: string; unofficial: string | false; genericCrm: string | false };

const COMPARISON: Row[] = [
  {
    feature: "Official Meta Cloud API",
    whatscrm: "Yes",
    unofficial: false,
    genericCrm: "Usually via add-on",
  },
  {
    feature: "AI replies from your own documents",
    whatscrm: "Built in, with citations",
    unofficial: false,
    genericCrm: false,
  },
  {
    feature: "Automatic BANT lead scoring",
    whatscrm: "0–100, per conversation",
    unofficial: false,
    genericCrm: "Manual fields",
  },
  {
    feature: "Shared inbox with assignment",
    whatscrm: "Yes",
    unofficial: "Single device",
    genericCrm: "Yes",
  },
  {
    feature: "Campaigns with per-recipient tracking",
    whatscrm: "Yes",
    unofficial: "Risk of ban",
    genericCrm: "Email-first",
  },
  {
    feature: "Visual automation flows",
    whatscrm: "Twelve blocks, no code",
    unofficial: false,
    genericCrm: "Paid tier",
  },
  {
    feature: "Support tickets with SLA",
    whatscrm: "Yes",
    unofficial: false,
    genericCrm: "Separate product",
  },
  {
    feature: "Number stays safe long term",
    whatscrm: "Meta-compliant",
    unofficial: "No guarantee",
    genericCrm: "Depends on add-on",
  },
];

const PRINCIPLES = [
  {
    Icon: Sparkles,
    title: "Ship the boring thing that works",
    body: "A feature nobody can find is not a feature. We would rather finish one workflow properly than announce five.",
  },
  {
    Icon: Building2,
    title: "Built for how Indian teams actually sell",
    body: "WhatsApp first, phone second, email a distant third. The product is shaped around that order, not retrofitted to it.",
  },
  {
    Icon: Lock,
    title: "Earn the trust before asking for the data",
    body: "Isolated workspaces, encryption at rest, and a refund policy we honour without asking why.",
  },
];

/** A comparison cell: `false` renders as a dash, a string as a ticked value. */
function Cell({ value, strong = false }: { value: string | false; strong?: boolean }) {
  if (value === false) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-slate-400">
        <Minus className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">Not available</span>
      </span>
    );
  }
  return (
    <span
      className={
        strong
          ? "inline-flex items-start gap-1.5 text-sm font-semibold text-slate-900"
          : "text-sm text-slate-500"
      }
    >
      {strong && <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />}
      {value}
    </span>
  );
}

export default function WhyChooseUsPage() {
  return (
    <div>
      <PageHero
        eyebrow="Why choose us"
        title="Six reasons, each with a mechanism behind it"
        description="Every WhatsApp tool claims to be powerful and reliable. Here is what WhatsCRM actually does differently, and why each difference matters on the day you need it."
        primaryCta={{ label: "Start Free Trial", href: "/register" }}
        secondaryCta={{ label: "See pricing", href: "/pricing" }}
      />

      <Section tone="soft" glow>
        <Stage className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {REASONS.map((reason, i) => (
            <div
              key={reason.title}
              style={stagger(i, 70)}
              className="wa-lift wa-hover-lift group h-full rounded-2xl bg-white p-6 shadow-sm ring-1 ring-inset ring-slate-900/5 hover:shadow-lg hover:shadow-emerald-900/5 hover:ring-emerald-500/25"
            >
              <span className="wa-icon-tilt flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-600/15 transition-colors duration-300 group-hover:bg-emerald-600 group-hover:ring-emerald-600">
                <reason.Icon className="h-5 w-5 text-emerald-600 transition-colors duration-300 group-hover:text-white" />
              </span>
              <h2 className="mt-4 text-base font-bold tracking-tight text-slate-900">
                {reason.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{reason.body}</p>
            </div>
          ))}
        </Stage>
      </Section>

      <Section tone="plain">
        <SectionHeading
          align="center"
          eyebrow="The comparison"
          title="What you are actually choosing between"
          description="Not competitors by name — the three kinds of tool a team on WhatsApp ends up weighing against each other."
        />

        {/* The table scrolls inside its own container rather than widening the page.
            Three columns of prose will not fit a phone at any font size, and a page
            that scrolls sideways is a page that feels broken. */}
        <Reveal delay={120}>
          <div className="relative mt-8 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-inset ring-slate-900/5">
            <table className="w-full min-w-[46rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200">
                  <th scope="col" className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Capability
                  </th>
                  <th scope="col" className="bg-emerald-50/60 px-5 py-4 text-xs font-semibold uppercase tracking-wider text-emerald-800">
                    WhatsCRM
                  </th>
                  <th scope="col" className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Unofficial API wrapper
                  </th>
                  <th scope="col" className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Generic CRM + plugin
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.feature} className="border-b border-slate-100 last:border-0">
                    <th scope="row" className="px-5 py-4 text-sm font-medium text-slate-700">
                      {row.feature}
                    </th>
                    <td className="bg-emerald-50/40 px-5 py-4">
                      <Cell value={row.whatscrm} strong />
                    </td>
                    <td className="px-5 py-4">
                      <Cell value={row.unofficial} />
                    </td>
                    <td className="px-5 py-4">
                      <Cell value={row.genericCrm} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </Section>

      <Section tone="wash">
        <SectionHeading
          align="center"
          eyebrow="How we build"
          title="Three principles that decide what ships"
        />
        <Stage className="mt-8 grid gap-4 sm:grid-cols-3">
          {PRINCIPLES.map((principle, i) => (
            <div
              key={principle.title}
              style={stagger(i, 90)}
              className="wa-lift wa-hover-lift group rounded-2xl bg-white/80 p-6 shadow-sm ring-1 ring-inset ring-slate-900/5 backdrop-blur hover:shadow-lg hover:shadow-emerald-900/5 hover:ring-emerald-500/25"
            >
              <span className="wa-icon-tilt flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-600/15 transition-colors duration-300 group-hover:bg-emerald-600 group-hover:ring-emerald-600">
                <principle.Icon className="h-4 w-4 text-emerald-600 transition-colors duration-300 group-hover:text-white" />
              </span>
              <h3 className="mt-4 text-sm font-bold tracking-tight text-slate-900">
                {principle.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{principle.body}</p>
            </div>
          ))}
        </Stage>
      </Section>

      <PageCta
        title="Try it against whatever you use today"
        description="Free trial, no card, and a 7-day refund window on your first paid charge if it does not beat what you already have."
        secondary={{ label: "Talk to us", href: "/contact" }}
      />
    </div>
  );
}
