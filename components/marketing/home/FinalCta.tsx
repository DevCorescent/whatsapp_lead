import Link from "next/link";
import { ArrowRight, PlayCircle } from "lucide-react";
import { Container, Reveal } from "./primitives";

/**
 * The close.
 *
 * One card, one promise, two ways to act on it. The gradient runs navy to emerald
 * because this is the only place on the page that should feel like an ending; the
 * ambient glow is two radial washes rather than a particle field, since the section
 * has to read as confident and anything busier competes with the buttons it exists
 * to serve.
 *
 * The supporting line says "free trial", not "14-day free trial". Trial length is set
 * per workspace by an administrator (`trialEndsAt` on the subscription) and there is
 * no fixed number anywhere in this codebase to quote, so quoting one would be a
 * promise the product does not make.
 */
export function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-white pb-16 pt-4 sm:pb-20">
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
                Ready to turn WhatsApp conversations
                <br className="hidden sm:block" /> into qualified leads?
              </h2>
              <p
                style={{ transitionDelay: "110ms" }}
                className="wa-lift mx-auto mt-3 text-sm text-slate-300 sm:text-base"
              >
                Start your free trial — no card required.
              </p>

              <div
                style={{ transitionDelay: "220ms" }}
                className="wa-lift mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row"
              >
                <Link
                  href="/register"
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3.5 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/25 transition hover:-translate-y-0.5 hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:w-auto"
                >
                  Start Free Trial
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="#how-it-works"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-6 py-3.5 text-sm font-semibold text-white ring-1 ring-inset ring-white/15 backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:w-auto"
                >
                  <PlayCircle className="h-4 w-4 text-emerald-400" />
                  See How It Works
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
