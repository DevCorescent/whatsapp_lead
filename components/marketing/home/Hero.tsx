import { ArrowRight, PlayCircle, ShieldCheck } from "lucide-react";
import type { PublicSection } from "@/lib/cms/sections";
import { cn } from "@/lib/utils";
import { Container, GridBackdrop, Reveal, Spotlight } from "./primitives";
import { HeroShowcase } from "./HeroShowcase";
import { CmsLink } from "./CmsLink";

const STAT_COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
};

/**
 * The ten-second promise, and the product visual that proves it.
 *
 * Claim on the left, the WhatsApp demo on the right, so the headline and the
 * conversation it describes are visible together. Every word here — including the
 * chat inside the phone — comes from the CMS "Hero" section.
 */
export function Hero({ section }: { section: PublicSection<"hero"> }) {
  const { content, items } = section;
  const stats = items.stat;

  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-b from-white via-emerald-50/50 to-white pb-14 pt-10 sm:pb-16 sm:pt-14">
      <GridBackdrop />
      <Spotlight />

      <Container className="relative">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-10">
          <div className="text-center lg:text-left">
            {content.badge && (
              <Reveal>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 shadow-sm ring-1 ring-inset ring-emerald-600/20 backdrop-blur">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="wa-pulse-ring absolute inline-flex h-full w-full rounded-full bg-emerald-400" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600" />
                  </span>
                  {content.badge}
                </span>
              </Reveal>
            )}

            <Reveal delay={80}>
              <h1 className="mt-5 text-[2.1rem] font-bold leading-[1.08] tracking-tight text-balance text-slate-900 sm:text-5xl lg:text-[3.25rem]">
                {content.title}
                {content.highlight && (
                  <>
                    {" "}
                    {/* Painted on the inline text with box-decoration-break: clone, so the
                        marker follows the phrase onto every line it wraps to. */}
                    <span className="bg-[linear-gradient(transparent_68%,rgba(110,231,183,0.75)_68%,rgba(153,246,228,0.75)_100%)] decoration-clone">
                      {content.highlight}
                    </span>
                  </>
                )}
              </h1>
            </Reveal>

            {content.description && (
              <Reveal delay={160}>
                <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg lg:mx-0">
                  {content.description}
                </p>
              </Reveal>
            )}

            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Reveal delay={240} className="w-full sm:w-auto">
                <CmsLink
                  href={content.primaryCtaHref}
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-600/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 sm:w-auto"
                >
                  {content.primaryCtaLabel}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </CmsLink>
              </Reveal>
              {content.secondaryCtaLabel && content.secondaryCtaHref && (
                <Reveal delay={300} className="w-full sm:w-auto">
                  <CmsLink
                    href={content.secondaryCtaHref}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-200 transition hover:-translate-y-0.5 hover:bg-slate-50 hover:text-slate-900 hover:ring-slate-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 sm:w-auto"
                  >
                    <PlayCircle className="h-4 w-4 text-emerald-600" />
                    {content.secondaryCtaLabel}
                  </CmsLink>
                </Reveal>
              )}
            </div>

            {stats.length > 0 && (
              <Reveal delay={340}>
                <dl
                  className={cn(
                    "mx-auto mt-8 grid max-w-lg gap-x-4 gap-y-3 border-t border-slate-900/[0.06] pt-6 lg:mx-0",
                    STAT_COLS[Math.min(stats.length, 4)],
                  )}
                >
                  {stats.map((stat) => (
                    <div key={stat.id} className="min-w-0">
                      <dt className="sr-only">{stat.label}</dt>
                      <dd className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">{stat.value}</dd>
                      <dd className="mt-0.5 text-xs leading-snug text-slate-500">{stat.label}</dd>
                    </div>
                  ))}
                </dl>
              </Reveal>
            )}

            {content.trustNote && (
              <Reveal delay={400}>
                <p className="mt-5 inline-flex items-center gap-2 text-xs text-slate-500">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  {content.trustNote}
                </p>
              </Reveal>
            )}
          </div>

          <div>
            <HeroShowcase
              chat={{
                contactName: content.chatContactName,
                contactStatus: content.chatContactStatus,
                customerMessage: content.chatCustomerMessage,
                aiLabel: content.chatAiLabel,
                aiReply: content.chatAiReply,
                attachmentName: content.chatAttachmentName,
                attachmentMeta: content.chatAttachmentMeta,
                time: content.chatTime,
                eventCtaLabel: content.chatEventCtaLabel,
                eventCtaHref: content.chatEventCtaHref,
              }}
              events={items.event}
            />
          </div>
        </div>
      </Container>
    </section>
  );
}
