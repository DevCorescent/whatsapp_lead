import type { ReactNode } from "react";
import { FileText } from "lucide-react";
import { Reveal, Stage } from "@/components/marketing/home/primitives";
import { stagger } from "@/components/marketing/home/motion";

export type LegalSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
};

/**
 * Shared shell for the legal pages — privacy, terms, refunds, cookies, security.
 *
 * Tailwind v4 here has no typography plugin, so the text styles are applied
 * explicitly rather than via `prose`.
 *
 * TWO CHANGES FROM THE ORIGINAL, both about the pages reading as finished rather than
 * as a wall someone has to get through:
 *
 *   The hero wash was `#6C3FC4` — a purple from an earlier palette that appeared
 *   nowhere else on the site. It is now the same white→emerald the marketing pages
 *   use, so a visitor arriving from the footer does not feel they have left.
 *
 *   A contents list sits beside the body on large screens and above it on small ones,
 *   built from the section headings themselves so it can never drift out of sync.
 *   Legal pages are read by search — someone wants clause four, not the whole page —
 *   and without a contents list finding it means scrolling and guessing.
 *
 * `slug` is derived from the heading rather than authored, for the same reason: one
 * source of truth, and no page can ship an anchor that points at nothing.
 */

/** A heading, reduced to something usable as an `id` and a fragment link. */
function slugify(heading: string) {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function LegalPage({
  title,
  lastUpdated,
  intro,
  sections,
  footer,
}: {
  title: string;
  lastUpdated: string;
  intro: string;
  sections: LegalSection[];
  footer?: ReactNode;
}) {
  return (
    <div>
      <section className="relative isolate overflow-hidden border-b border-slate-200/70 bg-gradient-to-b from-white via-emerald-50/60 to-white py-14 sm:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[26rem] w-[46rem] -translate-x-1/2 -translate-y-1/3 rounded-full bg-[radial-gradient(closest-side,rgba(16,185,129,0.14),transparent_100%)]"
        />
        <div className="relative mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 shadow-sm ring-1 ring-inset ring-emerald-600/20 backdrop-blur">
              <FileText className="h-3.5 w-3.5" aria-hidden />
              Legal
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-balance text-slate-900 sm:text-4xl">
              {title}
            </h1>
          </Reveal>
          <Reveal delay={140}>
            <p className="mt-3 text-sm text-slate-500">Last updated: {lastUpdated}</p>
          </Reveal>
          <Reveal delay={200}>
            <p className="mt-5 text-base leading-relaxed text-slate-600">{intro}</p>
          </Reveal>
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[15rem_1fr] lg:gap-14 lg:px-8">
          {/* Contents. Sticky only where there is room for it to be useful; on a phone
              it is a plain list above the body rather than a bar eating the viewport. */}
          <nav aria-label="Contents" className="lg:sticky lg:top-24 lg:self-start">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Contents
            </p>
            <ol className="mt-3 space-y-1.5">
              {sections.map((section, index) => (
                <li key={section.heading}>
                  <a
                    href={`#${slugify(section.heading)}`}
                    className="group flex gap-2 rounded-lg px-2 py-1 -mx-2 text-sm text-slate-600 transition-colors duration-200 hover:bg-emerald-50/70 hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                  >
                    <span className="nums shrink-0 text-slate-400 transition-colors duration-200 group-hover:text-emerald-600">
                      {index + 1}.
                    </span>
                    {section.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="min-w-0">
            <Stage className="space-y-10">
              {sections.map((section, index) => (
                <div
                  key={section.heading}
                  id={slugify(section.heading)}
                  style={stagger(Math.min(index, 6), 50)}
                  className="wa-lift scroll-mt-24"
                >
                  <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                    <span className="nums text-emerald-600">{index + 1}.</span> {section.heading}
                  </h2>

                  {section.paragraphs?.map((paragraph) => (
                    <p key={paragraph} className="mt-4 text-base leading-relaxed text-slate-600">
                      {paragraph}
                    </p>
                  ))}

                  {section.bullets && (
                    <ul className="mt-4 space-y-2.5">
                      {section.bullets.map((bullet) => (
                        <li key={bullet} className="flex items-start gap-2.5">
                          <span
                            aria-hidden
                            className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
                          />
                          <span className="text-base leading-relaxed text-slate-600">{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </Stage>

            {footer && (
              <Reveal delay={120}>
                <div className="mt-12 rounded-2xl bg-gradient-to-br from-slate-50 to-emerald-50/60 p-6 ring-1 ring-inset ring-slate-900/5">
                  {footer}
                </div>
              </Reveal>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
