import Link from "next/link";
import { ArrowRight, Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageCta, Section } from "@/components/marketing/PageShell";
import {
  Container,
  GridBackdrop,
  Reveal,
  SectionHeading,
  Spotlight,
  Stage,
} from "@/components/marketing/home/primitives";
import { stagger } from "@/components/marketing/home/motion";
import {
  ACCENT_STYLE,
  getOtherIndustries,
  type Industry,
} from "@/components/marketing/industries";
import { IndustryChatDemo } from "./IndustryChatDemo";

/**
 * One template, eight industry pages.
 *
 * WHY A TEMPLATE. Every industry page makes the same argument in the same order —
 * here is what breaks on WhatsApp in your sector, here is the automation that handles
 * it, here is what you end up with — and eight hand-written pages of one argument
 * drift within a month: one grows a testimonial, another loses its CTA, a third
 * develops its own spacing. The argument lives here; the content lives in
 * `components/marketing/industries.ts`, one row per industry.
 *
 * The pages are NOT interchangeable, though. Problems, flow, sample conversation,
 * capabilities and outcomes are all written per sector, so a real-estate visitor reads
 * about site visits and possession dates and an e-commerce visitor reads about carts
 * and exchange windows. What they share is the shape, which is the part a visitor is
 * not supposed to notice.
 *
 * THE ACCENT is the only visual difference, and it is deliberately confined to the
 * icon tiles, one hero wash and the column rule. Every CTA, the chat, the flow rail
 * and the dark close stay brand emerald — an industry page that changed its whole
 * palette would stop reading as the same product.
 */
export function IndustryPage({ industry }: { industry: Industry }) {
  const {
    id,
    Icon,
    accent,
    name,
    summary,
    useCases,
    heroTitle,
    problems,
    flow,
    chat,
    capabilities,
    outcomes,
  } = industry;

  const tone = ACCENT_STYLE[accent];
  const others = getOtherIndustries(id);

  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────────────────────────
             Two columns: the claim on the left, this sector's own conversation
             playing on the right. Same shape as the homepage hero, so a visitor who
             arrives here from an ad lands somewhere that feels like the same site. */}
      <section className="relative isolate overflow-hidden bg-gradient-to-b from-white via-emerald-50/50 to-white pb-12 pt-8 sm:pb-14 sm:pt-12">
        <GridBackdrop />
        <Spotlight />
        {/* The accent, at its strongest — and it is still only a wash. */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute -right-24 top-0 h-[26rem] w-[26rem] rounded-full",
            tone.glow,
          )}
        />

        <Container className="relative">
          <Reveal>
            <nav aria-label="Breadcrumb">
              <ol className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
                <li>
                  <Link
                    href="/"
                    className="rounded transition hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                  >
                    Home
                  </Link>
                </li>
                <ChevronRight aria-hidden className="h-3 w-3 text-slate-300" />
                <li>
                  <Link
                    href="/industries"
                    className="rounded transition hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                  >
                    Industries
                  </Link>
                </li>
                <ChevronRight aria-hidden className="h-3 w-3 text-slate-300" />
                <li aria-current="page" className="font-medium text-slate-700">
                  {name}
                </li>
              </ol>
            </nav>
          </Reveal>

          <div className="mt-6 grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
            <div className="text-center lg:text-left">
              <Reveal delay={60}>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700 shadow-sm ring-1 ring-inset ring-slate-900/10 backdrop-blur">
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-md ring-1 ring-inset",
                      tone.tile,
                    )}
                  >
                    <Icon className={cn("h-3 w-3", tone.icon)} aria-hidden />
                  </span>
                  WhatsCRM for {name}
                </span>
              </Reveal>

              <Reveal delay={120}>
                <h1 className="mt-5 text-[1.9rem] font-bold leading-[1.1] tracking-tight text-balance text-slate-900 sm:text-[2.6rem] lg:text-[2.75rem]">
                  {heroTitle}
                </h1>
              </Reveal>

              <Reveal delay={180}>
                <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-slate-600 lg:mx-0">
                  {summary}
                </p>
              </Reveal>

              <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <Reveal delay={240} className="w-full sm:w-auto">
                  <Link
                    href="/register"
                    className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-600/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 sm:w-auto"
                  >
                    Start Free Trial
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </Reveal>
                <Reveal delay={290} className="w-full sm:w-auto">
                  <Link
                    href="/contact"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-200 transition hover:-translate-y-0.5 hover:bg-slate-50 hover:text-slate-900 hover:ring-slate-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 sm:w-auto"
                  >
                    Talk to Sales
                  </Link>
                </Reveal>
              </div>

              <Reveal delay={340}>
                <ul className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-1.5 lg:justify-start">
                  {useCases.map((useCase) => (
                    <li
                      key={useCase}
                      className="inline-flex items-center gap-1.5 text-xs text-slate-500"
                    >
                      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                      {useCase}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>

            <div className="px-2 sm:px-6 lg:px-0">
              <IndustryChatDemo chat={chat} />
            </div>
          </div>
        </Container>
      </section>

      {/* ── The problem ──────────────────────────────────────────────────── */}
      <Section tone="plain">
        <SectionHeading
          align="center"
          eyebrow="The problem"
          title={`What ${name.toLowerCase()} teams lose on WhatsApp`}
        />
        <Stage className="mt-8 grid gap-3 sm:grid-cols-3">
          {problems.map((problem, i) => (
            <div
              key={problem.title}
              style={stagger(i, 80)}
              className="wa-lift flex h-full flex-col rounded-2xl bg-gradient-to-b from-slate-50 to-white p-5 shadow-sm ring-1 ring-inset ring-slate-900/5"
            >
              <span
                aria-hidden
                className={cn(
                  "block h-px w-8 rounded-full bg-gradient-to-r to-transparent",
                  tone.rule,
                )}
              />
              <h3 className="mt-4 text-sm font-bold tracking-tight text-slate-900">
                {problem.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{problem.body}</p>
            </div>
          ))}
        </Stage>
      </Section>

      {/* ── The automation, as a four-step rail ──────────────────────────────
             The same four beats the homepage hero plays, told in this sector's own
             words. Numbered rather than iconographic: the point of this section is
             the order, and a number says "then" better than a picture does. */}
      <Section tone="wash" glow>
        <SectionHeading
          align="center"
          eyebrow="The automation"
          title="Enquiry in, qualified lead out"
          description="Four steps, running on your own number, without anyone opening the app."
        />
        <Stage className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {flow.map((step, i) => (
            <div
              key={step.label}
              style={stagger(i, 80)}
              className="wa-lift relative flex h-full flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-inset ring-slate-900/5 transition duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-emerald-900/5 hover:ring-emerald-500/25"
            >
              {/* The connector, on the layout wide enough to have a single line for it
                  to follow. Absolutely positioned so it cannot add to the card's box. */}
              {i < flow.length - 1 && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute right-[-0.85rem] top-9 hidden h-px w-3 rounded-full bg-emerald-300 lg:block"
                />
              )}
              <span className="nums flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-xs font-bold text-white shadow-sm shadow-emerald-600/25">
                {i + 1}
              </span>
              <h3 className="mt-4 text-sm font-bold tracking-tight text-slate-900">{step.label}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{step.detail}</p>
            </div>
          ))}
        </Stage>
      </Section>

      {/* ── Capabilities ─────────────────────────────────────────────────── */}
      <Section tone="plain">
        <SectionHeading
          align="center"
          eyebrow="What you configure"
          title={`Built for how ${name.toLowerCase()} actually works`}
        />
        <Stage className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((capability, i) => (
            <div
              key={capability.title}
              style={stagger(i, 65)}
              className="wa-lift wa-hover-lift group flex h-full flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-inset ring-slate-900/5 hover:shadow-lg hover:shadow-emerald-900/5 hover:ring-emerald-500/25"
            >
              <span
                className={cn(
                  "wa-icon-tilt flex h-10 w-10 items-center justify-center rounded-xl ring-1 ring-inset",
                  tone.tile,
                )}
              >
                <capability.Icon className={cn("h-5 w-5", tone.icon)} aria-hidden />
              </span>
              <h3 className="mt-4 text-sm font-bold tracking-tight text-slate-900">
                {capability.title}
              </h3>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-600">
                {capability.body}
              </p>
            </div>
          ))}
        </Stage>
      </Section>

      {/* ── Outcomes ─────────────────────────────────────────────────────── */}
      <Section tone="soft">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.15fr] lg:gap-12">
          <SectionHeading
            eyebrow="The outcome"
            title="What changes in the first week"
            description="Three mechanisms, not three promises — each one is something the workspace does whether or not anyone remembers to."
          />
          <Stage className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {outcomes.map((outcome, i) => (
              <div
                key={outcome.title}
                style={stagger(i, 80)}
                className="wa-lift flex items-start gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-inset ring-slate-900/5"
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600/10">
                  <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold tracking-tight text-slate-900">
                    {outcome.title}
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-slate-600">
                    {outcome.body}
                  </span>
                </span>
              </div>
            ))}
          </Stage>
        </div>
      </Section>

      {/* ── Sideways navigation ──────────────────────────────────────────────
             A visitor who lands on the wrong industry page should reach the right one
             in a click, rather than going back to the listing to start again. */}
      <Section tone="plain">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading eyebrow="Not your sector?" title="Three more industries" />
          <Reveal delay={120}>
            <Link
              href="/industries"
              className="group inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 transition hover:text-emerald-800"
            >
              All industries
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </Reveal>
        </div>

        <Stage className="mt-6 grid gap-3 sm:grid-cols-3">
          {others.map((other, i) => {
            const otherTone = ACCENT_STYLE[other.accent];
            return (
              <Link
                key={other.id}
                href={`/industries/${other.id}`}
                style={stagger(i, 70)}
                className="wa-lift group flex h-full items-start gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-inset ring-slate-900/5 transition duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-emerald-900/5 hover:ring-emerald-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset",
                    otherTone.tile,
                  )}
                >
                  <other.Icon className={cn("h-4 w-4", otherTone.icon)} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-bold tracking-tight text-slate-900">
                    {other.name}
                    <ArrowRight className="h-3.5 w-3.5 text-emerald-600 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                    {other.problem}
                  </span>
                </span>
              </Link>
            );
          })}
        </Stage>
      </Section>

      <PageCta
        title={`Run this on your own ${name.toLowerCase()} number`}
        description="Free trial, no card required. Connect a number, upload one document, and the first automated reply goes out the same evening."
        secondary={{ label: "Talk to Sales", href: "/contact" }}
      />
    </div>
  );
}
