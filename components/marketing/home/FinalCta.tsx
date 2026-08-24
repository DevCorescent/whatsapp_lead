import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { Container, Reveal } from "./primitives";

/**
 * The close.
 *
 * One card, one promise, two ways to act on it. The ambient glow is two radial
 * gradients rather than a particle field — the section has to read as confident, and
 * anything busier competes with the buttons it exists to serve.
 */
export function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-white pb-24 pt-4 sm:pb-32">
      <Container>
        <Reveal>
          <div className="relative isolate overflow-hidden rounded-3xl bg-slate-900 px-6 py-16 text-center shadow-2xl shadow-slate-900/20 sm:px-16 sm:py-20">
            <div aria-hidden className="wa-dots pointer-events-none absolute inset-0 opacity-60" />
            <div
              aria-hidden
              className="pointer-events-none absolute -left-24 -top-24 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(closest-side,rgba(16,185,129,0.28),transparent_100%)]"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-32 -right-20 h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(closest-side,rgba(45,212,191,0.22),transparent_100%)]"
            />

            <div className="relative mx-auto max-w-2xl">
              <h2 className="wa-lift text-3xl font-bold leading-tight tracking-tight text-balance text-white sm:text-4xl lg:text-5xl">
                Turn WhatsApp conversations
                <br className="hidden sm:block" /> into customers.
              </h2>
              <p
                style={{ transitionDelay: "110ms" }}
                className="wa-lift mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-300"
              >
                Give your team one inbox, intelligent automation, and a sales pipeline built around
                conversations.
              </p>

              <div
                style={{ transitionDelay: "220ms" }}
                className="wa-lift mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
              >
                <Link
                  href="/register"
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3.5 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/25 transition hover:-translate-y-0.5 hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:w-auto"
                >
                  Start Free Trial
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-6 py-3.5 text-sm font-semibold text-white ring-1 ring-inset ring-white/15 backdrop-blur transition hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:w-auto"
                >
                  <CalendarDays className="h-4 w-4" />
                  Book a Demo
                </Link>
              </div>

              <p style={{ transitionDelay: "300ms" }} className="wa-lift mt-6 text-xs text-slate-400">
                Set up in minutes on the official Meta WhatsApp Business Cloud API.
              </p>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
