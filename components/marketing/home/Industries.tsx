import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { INDUSTRIES, type Industry } from "@/components/marketing/industries";
import type { PublicSection } from "@/lib/cms/sections";
import { Container, Reveal, SectionHeading } from "./primitives";
import { CmsLink } from "./CmsLink";

/**
 * Who this is for, as a strip that moves.
 *
 * A strip that drifts past is something a visitor glances at, finds their own
 * business in, and moves on from — which is the entire job of this section.
 *
 * CMS-DRIVEN SELECTION, CODE-DRIVEN PAGES. The heading, the link and which industry
 * cards appear (in which order, with an optional line) come from the CMS
 * "Industries" section. Each card still resolves to an entry in
 * components/marketing/industries.ts, so it always links to a page that exists; an
 * id the list no longer knows is skipped rather than rendered as a dead card.
 *
 * HOW THE MARQUEE WORKS. The list is rendered twice inside one track and the track
 * translates by exactly -50%, so the loop is seamless. The duplicate is
 * `aria-hidden`. It only animates from `sm` up; on a phone it is a snap scroller.
 */

type Card = { key: string; industry: Industry; line: string };

function IndustryCard({ card, hidden = false }: { card: Card; hidden?: boolean }) {
  const { id, Icon, short } = card.industry;

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

      <span className="mt-3 block text-[15px] font-semibold tracking-tight text-slate-900">{short}</span>
      <span className="mt-1 block text-xs leading-relaxed text-slate-500">{card.line}</span>

      <ArrowRight className="mt-3 h-4 w-4 text-emerald-600 transition-transform duration-300 group-hover:translate-x-1" />
    </Link>
  );
}

export function Industries({ section }: { section: PublicSection<"industries"> }) {
  const { content } = section;

  const cards: Card[] = section.items.industry.flatMap((item) => {
    const industry = INDUSTRIES.find((entry) => entry.id === item.industryId);
    return industry ? [{ key: item.id, industry, line: item.line || industry.line }] : [];
  });

  if (cards.length === 0) return null;

  return (
    <section
      id="industries"
      className="relative scroll-mt-20 overflow-hidden bg-gradient-to-br from-sky-50/60 via-white to-emerald-50/60 py-14 sm:py-16"
    >
      <Container>
        <SectionHeading
          align="center"
          eyebrow={content.eyebrow}
          title={content.title}
          description={content.description}
        />
      </Container>

      {/* Full-bleed, with feathered ends from `sm` (a mask, so it matches the diagonal
          gradient behind it). Below `sm` the strip is a plain scroller. */}
      <Reveal delay={80}>
        <div className="wa-marquee-hold relative mt-7 sm:[mask-image:linear-gradient(to_right,transparent,#000_4rem,#000_calc(100%-4rem),transparent)]">
          <div className="scrollbar-slim flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:overflow-hidden sm:px-0 sm:pb-0">
            <div className="wa-marquee-desktop flex shrink-0 gap-3 sm:min-w-full">
              {cards.map((card) => (
                <IndustryCard key={card.key} card={card} />
              ))}
              {/* The second copy exists only to make the wrap seamless. */}
              <div className="hidden shrink-0 gap-3 sm:flex">
                {cards.map((card) => (
                  <IndustryCard key={`${card.key}-loop`} card={card} hidden />
                ))}
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      {content.linkLabel && content.linkHref && (
        <Container>
          <Reveal delay={160}>
            <p className="mt-7 text-center text-sm">
              <CmsLink
                href={content.linkHref}
                className="font-semibold text-emerald-700 underline decoration-emerald-300 underline-offset-4 transition hover:text-emerald-800"
              >
                {content.linkLabel} →
              </CmsLink>
            </p>
          </Reveal>
        </Container>
      )}
    </section>
  );
}
