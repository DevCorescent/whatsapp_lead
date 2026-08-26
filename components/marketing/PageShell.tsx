import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  Container,
  GridBackdrop,
  Reveal,
  Spotlight,
} from "@/components/marketing/home/primitives";

/**
 * The shell every top-level marketing page is built from.
 *
 * WHY IT EXISTS. Ten pages were added in one change — Solutions, Portfolio,
 * Resources, Why Choose Us, Careers, the two API pages, the site map and two legal
 * additions. Ten hand-rolled heroes drift within a week: one gets a different eyebrow
 * size, another a different top padding, and the site stops reading as one product.
 * Everything here composes the primitives the homepage already uses, so a page built
 * from it inherits the homepage's reveal timing, spotlight and container rhythm for
 * free.
 *
 * THREE PIECES, and no page needs more:
 *   PageHero  — the white→emerald wash, eyebrow, title, one paragraph, up to two CTAs
 *   Section   — a band with an optional tint, so a page can alternate without inventing
 *   PageCta   — the navy→emerald close, identical in shape to the homepage's FinalCta
 *
 * `tone` on Section is the whole gradient vocabulary, deliberately small: plain white,
 * a soft green wash, or a slate-to-green wash. Anything stronger belongs to the
 * homepage's one dark band, which is the only section on the site allowed to shout.
 */

export function PageHero({
  eyebrow,
  title,
  description,
  primaryCta,
  secondaryCta,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  primaryCta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  /** Stat strip, chips, anything that belongs above the fold and under the CTAs. */
  children?: ReactNode;
}) {
  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-b from-white via-emerald-50/60 to-white pb-14 pt-12 sm:pb-16 sm:pt-16">
      <GridBackdrop />
      <Spotlight />

      <Container className="relative">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 shadow-sm ring-1 ring-inset ring-emerald-600/20 backdrop-blur">
              <span className="relative flex h-1.5 w-1.5">
                <span className="wa-pulse-ring absolute inline-flex h-full w-full rounded-full bg-emerald-400" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600" />
              </span>
              {eyebrow}
            </span>
          </Reveal>

          <Reveal delay={80}>
            <h1 className="mt-5 text-[2rem] font-bold leading-[1.1] tracking-tight text-balance text-slate-900 sm:text-5xl">
              {title}
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-600">
              {description}
            </p>
          </Reveal>

          {(primaryCta || secondaryCta) && (
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {primaryCta && (
                <Reveal delay={240} className="w-full sm:w-auto">
                  <Link
                    href={primaryCta.href}
                    className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-600/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 sm:w-auto"
                  >
                    {primaryCta.label}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </Reveal>
              )}
              {secondaryCta && (
                <Reveal delay={300} className="w-full sm:w-auto">
                  <Link
                    href={secondaryCta.href}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-200 transition hover:-translate-y-0.5 hover:bg-slate-50 hover:text-slate-900 hover:ring-slate-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 sm:w-auto"
                  >
                    {secondaryCta.label}
                  </Link>
                </Reveal>
              )}
            </div>
          )}

          {children && <Reveal delay={360}>{children}</Reveal>}
        </div>
      </Container>
    </section>
  );
}

const TONES = {
  plain: "bg-white",
  soft: "bg-gradient-to-b from-emerald-50/60 via-white to-white",
  wash: "bg-gradient-to-br from-slate-50 via-white to-emerald-50/70",
} as const;

export function Section({
  id,
  tone = "plain",
  glow = false,
  className,
  children,
}: {
  id?: string;
  tone?: keyof typeof TONES;
  /** A single radial emerald wash behind the content, for the sections that carry weight. */
  glow?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn("relative scroll-mt-20 overflow-hidden py-14 sm:py-16", TONES[tone], className)}
    >
      {glow && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[26rem] w-[52rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(16,185,129,0.10),transparent_100%)]"
        />
      )}
      <Container className="relative">{children}</Container>
    </section>
  );
}

/**
 * The close, in the same shape as the homepage's FinalCta.
 *
 * Repeated on every page rather than made optional: a marketing page that ends in a
 * link list ends in nothing, and the one action every one of these pages is for is the
 * same action.
 */
export function PageCta({
  title,
  description,
  primary = { label: "Start Free Trial", href: "/register" },
  secondary,
}: {
  title: ReactNode;
  description: ReactNode;
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
}) {
  return (
    <section className="relative overflow-hidden bg-white pb-16 pt-6 sm:pb-20">
      <Container>
        <Reveal>
          <div className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-900 px-6 py-12 text-center shadow-2xl shadow-slate-900/20 sm:px-14 sm:py-14">
            <div aria-hidden className="wa-dots pointer-events-none absolute inset-0 opacity-50" />
            <div
              aria-hidden
              className="pointer-events-none absolute -left-24 -top-24 h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(closest-side,rgba(16,185,129,0.32),transparent_100%)]"
            />
            <div
              aria-hidden
              className="wa-float-slow pointer-events-none absolute -bottom-28 -right-16 h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(closest-side,rgba(45,212,191,0.24),transparent_100%)]"
            />

            <div className="relative mx-auto max-w-2xl">
              <h2 className="wa-lift text-2xl font-bold leading-tight tracking-tight text-balance text-white sm:text-4xl">
                {title}
              </h2>
              <p
                style={{ transitionDelay: "110ms" }}
                className="wa-lift mx-auto mt-3 text-sm text-slate-300 sm:text-base"
              >
                {description}
              </p>

              <div
                style={{ transitionDelay: "220ms" }}
                className="wa-lift mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row"
              >
                <Link
                  href={primary.href}
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3.5 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/25 transition hover:-translate-y-0.5 hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:w-auto"
                >
                  {primary.label}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                {secondary && (
                  <Link
                    href={secondary.href}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-6 py-3.5 text-sm font-semibold text-white ring-1 ring-inset ring-white/15 backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:w-auto"
                  >
                    {secondary.label}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
