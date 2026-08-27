import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Bot, Target, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageCta, PageHero, Section } from "@/components/marketing/PageShell";
import { Stage } from "@/components/marketing/home/primitives";
import { stagger } from "@/components/marketing/home/motion";
import { ACCENT_STYLE, INDUSTRIES } from "@/components/marketing/industries";

export const metadata: Metadata = {
  title: "Industries — WhatsCRM",
  description:
    "How retail, real estate, education, healthcare, professional services, e-commerce, finance and automotive teams use WhatsCRM to capture and close leads on WhatsApp.",
};

/**
 * The industry index.
 *
 * A DOOR, NOT A DESTINATION. This page used to be the industry content — eight long
 * cards, every use case spelled out, nowhere to go from any of them. That made it the
 * longest page on the site and the least likely to be read, and it meant an ad
 * pointing at "WhatsCRM for real estate" had to land on a page that was mostly about
 * seven other sectors.
 *
 * So the cards are now compact and each one is a link to a page of its own. Name, the
 * pain in one line, what WhatsCRM does about it in one line, an arrow. Everything
 * longer moved to /industries/[industry], where it belongs.
 *
 * The card keeps `id` as an anchor target, so the older `/industries#real-estate`
 * links that exist in the wild still land on the right card rather than 404ing.
 */

/** What every one of the eight has in common, said once instead of eight times. */
const SHARED = [
  { Icon: Bot, title: "AI replies from your documents", body: "Grounded answers in seconds, at any hour." },
  { Icon: Target, title: "Leads qualified automatically", body: "Scored on what the customer actually wrote." },
  { Icon: Workflow, title: "A pipeline that updates itself", body: "Stage, owner and history, with no data entry." },
];

export default function IndustriesPage() {
  return (
    <div>
      <PageHero
        eyebrow="Industries"
        title="Built for the way your industry sells"
        description="Every sector loses leads on WhatsApp in its own way. Pick yours to see the automation that fixes it."
        primaryCta={{ label: "Start Free Trial", href: "/register" }}
        secondaryCta={{ label: "Talk to Sales", href: "/contact" }}
      />

      {/* ── The eight, as compact cards ──────────────────────────────────── */}
      <Section tone="soft" glow className="pt-2 sm:pt-4">
        <Stage className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {INDUSTRIES.map((industry, i) => {
            const tone = ACCENT_STYLE[industry.accent];
            return (
              <Link
                key={industry.id}
                id={industry.id}
                href={`/industries/${industry.id}`}
                style={stagger(i, 55)}
                className="wa-lift group flex h-full scroll-mt-24 flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-inset ring-slate-900/5 transition duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-emerald-900/10 hover:ring-emerald-500/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
              >
                <span
                  className={cn(
                    "wa-icon-tilt flex h-10 w-10 items-center justify-center rounded-xl ring-1 ring-inset",
                    tone.tile,
                  )}
                >
                  <industry.Icon className={cn("h-5 w-5", tone.icon)} aria-hidden />
                </span>

                <h2 className="mt-4 text-base font-bold tracking-tight text-slate-900">
                  {industry.short}
                </h2>

                <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                  The problem
                </p>
                <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{industry.problem}</p>

                <p className="mt-3 text-xs font-medium uppercase tracking-wide text-emerald-600">
                  WhatsCRM does
                </p>
                <p className="mt-0.5 flex-1 text-sm leading-relaxed text-slate-600">
                  {industry.solution}
                </p>

                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                  Explore
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                </span>
              </Link>
            );
          })}
        </Stage>
      </Section>

      {/* ── What every page has in common ────────────────────────────────── */}
      <Section tone="plain" className="py-10 sm:py-12">
        <Stage className="grid gap-3 sm:grid-cols-3">
          {SHARED.map((item, i) => (
            <div
              key={item.title}
              style={stagger(i, 70)}
              className="wa-lift flex items-start gap-3 rounded-2xl bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm ring-1 ring-inset ring-slate-900/5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-600/15">
                <item.Icon className="h-4 w-4 text-emerald-600" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold tracking-tight text-slate-900">
                  {item.title}
                </span>
                <span className="mt-0.5 block text-sm leading-relaxed text-slate-600">
                  {item.body}
                </span>
              </span>
            </div>
          ))}
        </Stage>
      </Section>

      <PageCta
        title="Not sure how it fits your business?"
        description="Tell us how your team sells today and we will show you exactly what WhatsCRM would change."
        secondary={{ label: "Book a Demo", href: "/contact" }}
      />
    </div>
  );
}
