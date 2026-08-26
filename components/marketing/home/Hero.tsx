import Link from "next/link";
import { ArrowRight, PlayCircle, ShieldCheck } from "lucide-react";
import { Container, GridBackdrop, Reveal, Spotlight } from "./primitives";
import { HeroShowcase } from "./HeroShowcase";

/**
 * The ten-second promise, and the product visual that proves it.
 *
 * Two columns: the claim on the left, the product on the right. Centred-and-stacked
 * put the screenshot below the fold, which meant the first thing a visitor saw was
 * text — the opposite of what this page is for. Side by side, the headline and the
 * thread it describes are visible together.
 *
 * One supporting line, and it names the three things the product does. Everything
 * else on this page is a proof point for that sentence.
 */
export function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-b from-white via-emerald-50/50 to-white pb-14 pt-10 sm:pb-16 sm:pt-14">
      <GridBackdrop />
      <Spotlight />

      <Container className="relative">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-10">
          <div className="text-center lg:text-left">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 shadow-sm ring-1 ring-inset ring-emerald-600/20 backdrop-blur">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="wa-pulse-ring absolute inline-flex h-full w-full rounded-full bg-emerald-400" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600" />
                </span>
                AI-powered WhatsApp CRM
              </span>
            </Reveal>

            <Reveal delay={80}>
              <h1 className="mt-5 text-[2.1rem] font-bold leading-[1.08] tracking-tight text-balance text-slate-900 sm:text-5xl lg:text-[3.25rem]">
                Turn WhatsApp conversations{" "}
                {/* Aceternity Hero Highlight.
                    Painted as a gradient background on the inline text with
                    box-decoration-break: clone, not as an absolutely positioned bar.
                    An absolute bar is sized to the inline-block's full line width, so
                    the moment the phrase wraps — which it does on every phone — the
                    stroke runs edge to edge under a half-width last line. This follows
                    the text on every line it occupies, at any width. */}
                <span className="bg-[linear-gradient(transparent_68%,rgba(110,231,183,0.75)_68%,rgba(153,246,228,0.75)_100%)] decoration-clone">
                  into qualified leads.
                </span>
              </h1>
            </Reveal>

            <Reveal delay={160}>
              <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-slate-600 lg:mx-0">
                AI replies, qualifies leads and updates your CRM automatically.
              </p>
            </Reveal>

            {/* The two CTAs arrive separately, 60ms apart. One Reveal around both
                would land them together, which reads as a block appearing rather than
                as a sequence resolving on the primary action. */}
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Reveal delay={240} className="w-full sm:w-auto">
                <Link
                  href="/register"
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-600/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 sm:w-auto"
                >
                  Start Free Trial
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Reveal>
              <Reveal delay={300} className="w-full sm:w-auto">
                <Link
                  href="#how-it-works"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-200 transition hover:-translate-y-0.5 hover:bg-slate-50 hover:text-slate-900 hover:ring-slate-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 sm:w-auto"
                >
                  <PlayCircle className="h-4 w-4 text-emerald-600" />
                  See How It Works
                </Link>
              </Reveal>
            </div>

            <Reveal delay={360}>
              <p className="mt-5 inline-flex items-center gap-2 text-xs text-slate-500">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                Built on the official Meta WhatsApp Business Cloud API
              </p>
            </Reveal>
          </div>

          {/* Extra right padding on the column, not the card: the score and pipeline
              cards hang off the composition's corners and would otherwise be clipped
              by the container's own gutter. */}
          <div className="px-2 sm:px-6 lg:px-0">
            <HeroShowcase />
          </div>
        </div>
      </Container>
    </section>
  );
}
