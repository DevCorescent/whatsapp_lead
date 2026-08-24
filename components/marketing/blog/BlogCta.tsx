import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { Container, Reveal } from "@/components/marketing/home/primitives";

/**
 * The band that closes every blog page.
 *
 * Shares the homepage's closing card treatment — dark ground, two radial emerald
 * washes, one primary and one secondary action — so a reader arriving from an article
 * meets the same ending they would have met on the homepage rather than a new design.
 */
export function BlogCta() {
  return (
    <section className="relative overflow-hidden bg-white py-16 sm:py-20">
      <Container>
        <Reveal>
          <div className="relative isolate overflow-hidden rounded-3xl bg-slate-900 px-6 py-14 text-center shadow-2xl shadow-slate-900/20 sm:px-16 sm:py-16">
            <div aria-hidden className="wa-dots pointer-events-none absolute inset-0 opacity-60" />
            <div
              aria-hidden
              className="pointer-events-none absolute -left-24 -top-24 h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(closest-side,rgba(16,185,129,0.28),transparent_100%)]"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-28 -right-20 h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(closest-side,rgba(45,212,191,0.22),transparent_100%)]"
            />

            <div className="relative mx-auto max-w-2xl">
              <h2 className="wa-lift text-3xl font-bold leading-tight tracking-tight text-balance text-white sm:text-4xl">
                Get product updates in your inbox
              </h2>
              <p
                style={{ transitionDelay: "110ms" }}
                className="wa-lift mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-300"
              >
                Product updates, WhatsApp insights, automation tips and more — from the team
                building WhatsCRM.
              </p>

              <div
                style={{ transitionDelay: "220ms" }}
                className="wa-lift mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
              >
                <Link
                  href="/register"
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3.5 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/25 transition hover:-translate-y-0.5 hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:w-auto"
                >
                  Start Free
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-6 py-3.5 text-sm font-semibold text-white ring-1 ring-inset ring-white/15 backdrop-blur transition hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:w-auto"
                >
                  <CalendarDays className="h-4 w-4" />
                  Book Demo
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
