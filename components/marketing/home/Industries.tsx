import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { HOME_INDUSTRIES, type Industry } from "@/components/marketing/industries";
import { Container, Reveal, SectionHeading } from "./primitives";

/**
 * Who this is for, as a strip that moves.
 *
 * A grid of six cards is a grid a visitor has to read. A strip that drifts past is
 * something they glance at, find their own business in, and move on from — which is
 * the entire job of this section.
 *
 * HOW THE MARQUEE WORKS. The list is rendered twice inside one track and the track
 * translates by exactly -50%, so the moment the first copy leaves the frame the
 * second copy is sitting precisely where it started and the loop is seamless. The
 * duplicate is `aria-hidden`, so a screen reader hears six industries, not twelve.
 *
 * It only animates from `sm` up. On a phone the same markup is a snap scroller: a
 * strip that moves on its own under a thumb cannot be read, and there is no hover to
 * pause it with. Pausing on hover *and* on focus-within, so tabbing to a card's link
 * stops the strip rather than dragging the focus ring out of the frame.
 */

function IndustryCard({ industry, hidden = false }: { industry: Industry; hidden?: boolean }) {
  const { id, Icon, short, line } = industry;

  return (
    <Link
      href={`/industries/${id}`}
      tabIndex={hidden ? -1 : undefined}
      aria-hidden={hidden || undefined}
      className={cn(
        "group flex w-[15rem] shrink-0 snap-center flex-col rounded-2xl bg-white/90 p-4 shadow-sm ring-1 ring-inset ring-slate-900/5 backdrop-blur-sm",
        "transition duration-300 hover:-translate-y-1 hover:bg-white hover:shadow-lg hover:shadow-emerald-900/10 hover:ring-emerald-500/30",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-600/15 transition-colors duration-300 group-hover:bg-emerald-600 group-hover:ring-emerald-600">
        <Icon className="h-5 w-5 text-emerald-600 transition-all duration-300 group-hover:scale-110 group-hover:text-white" />
      </span>

      <span className="mt-3 block text-[15px] font-semibold tracking-tight text-slate-900">
        {short}
      </span>
      <span className="mt-1 block text-xs leading-relaxed text-slate-500">{line}</span>

      <ArrowRight className="mt-3 h-4 w-4 text-emerald-600 transition-transform duration-300 group-hover:translate-x-1" />
    </Link>
  );
}

export function Industries() {
  return (
    <section
      id="industries"
      className="relative scroll-mt-20 overflow-hidden bg-gradient-to-br from-sky-50/60 via-white to-emerald-50/60 py-12 sm:py-14"
    >
      <Container>
        <SectionHeading
          align="center"
          eyebrow="Who it's for"
          title="Built for the way you sell"
          description="WhatsCRM works across industries to help you close more deals."
        />
      </Container>

      {/* Full-bleed: the strip should run off both edges of the screen, which is what
          makes it read as continuous rather than as a row that happens to be wide. */}
      <Reveal delay={80}>
        {/* Feathered ends, so cards enter and leave rather than being cut off.
            A mask rather than two gradient overlays painted in the section's own
            colours: the background here is a diagonal gradient, so an overlay would
            match it at exactly one point and seam everywhere else. Written as a
            Tailwind arbitrary property so the build emits it with its own vendor
            prefixes — the same declaration hand-written in globals.css was dropped
            by the CSS pipeline. `sm:` only: below that the strip is a scroller, and
            a faded first card is just a card you cannot read. */}
        <div className="wa-marquee-hold relative mt-7 sm:[mask-image:linear-gradient(to_right,transparent,#000_4rem,#000_calc(100%-4rem),transparent)]">
          <div className="scrollbar-slim flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:overflow-hidden sm:px-0 sm:pb-0">
            <div className="wa-marquee-desktop flex shrink-0 gap-3 sm:min-w-full">
              {HOME_INDUSTRIES.map((industry) => (
                <IndustryCard key={industry.id} industry={industry} />
              ))}
              {/* The second copy exists only to make the wrap seamless. */}
              <div className="hidden shrink-0 gap-3 sm:flex">
                {HOME_INDUSTRIES.map((industry) => (
                  <IndustryCard key={`${industry.id}-loop`} industry={industry} hidden />
                ))}
              </div>
            </div>
          </div>

        </div>
      </Reveal>

      <Container>
        <Reveal delay={160}>
          <p className="mt-7 text-center text-sm">
            <Link
              href="/industries"
              className="font-semibold text-emerald-700 underline decoration-emerald-300 underline-offset-4 transition hover:text-emerald-800"
            >
              See how each industry uses it →
            </Link>
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
