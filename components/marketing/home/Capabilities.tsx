import { ArrowRight } from "lucide-react";
import type { PublicSection } from "@/lib/cms/sections";
import { cn } from "@/lib/utils";
import { Container, Reveal, SectionHeading, Stage } from "./primitives";
import { stagger } from "./motion";
import { CmsIcon } from "./cmsIcon";
import { CmsLink } from "./CmsLink";
import { balancedCols } from "./cmsLayout";

/**
 * Platform / products: the feature grid in the dark band.
 *
 * DARK GLASS, NOT DARK CARDS. Each tile is a translucent wash over the band's own
 * gradient with a hairline border, so the grid reads as one surface with regions
 * rather than rectangles dropped on a background. Cards are items in the CMS
 * "Products" section; a card's link is optional.
 */
export function Capabilities({ section }: { section: PublicSection<"products"> }) {
  const { content } = section;
  const products = section.items.product;

  return (
    <section id="platform" className="relative scroll-mt-20 border-t border-white/[0.06] py-14 sm:py-16">
      <Container>
        <SectionHeading
          align="center"
          tone="dark"
          eyebrow={content.eyebrow}
          title={content.title}
          description={content.description}
        />

        {products.length > 0 && (
          <Stage className="mt-9">
            <ul className={cn("grid gap-3 sm:grid-cols-2", balancedCols(products.length))}>
              {products.map((item, i) => (
                <li key={item.id} style={stagger(i, 60)} className="wa-lift">
                  <div className="wa-glass group relative flex h-full flex-col rounded-2xl border border-white/[0.08] bg-white/[0.035] p-5 backdrop-blur hover:border-emerald-400/30 hover:bg-white/[0.06] hover:shadow-[0_18px_40px_-20px_rgba(16,185,129,0.45)]">
                    <span
                      aria-hidden
                      className="wa-aura pointer-events-none absolute -inset-px -z-10 rounded-2xl bg-gradient-to-b from-emerald-400/25 to-teal-400/5 blur-md"
                    />

                    <span className="wa-icon-tilt relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 transition-colors duration-300 group-hover:border-emerald-400/50 group-hover:bg-emerald-400/20">
                      <CmsIcon
                        name={item.icon}
                        className="relative h-4.5 w-4.5 text-emerald-300 transition-colors duration-300 group-hover:text-emerald-200"
                      />
                    </span>

                    <h3 className="mt-4 text-sm font-semibold tracking-tight text-white">{item.title}</h3>
                    {item.description && (
                      <p className="mt-1 flex-1 text-[13px] leading-relaxed text-slate-400 transition-colors duration-300 group-hover:text-slate-300">
                        {item.description}
                      </p>
                    )}

                    {item.ctaLabel && item.ctaHref && (
                      <CmsLink
                        href={item.ctaHref}
                        className="group/link mt-4 inline-flex w-fit items-center gap-1 rounded text-xs font-semibold text-emerald-300 transition hover:text-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
                      >
                        {item.ctaLabel}
                        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover/link:translate-x-0.5" />
                      </CmsLink>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Stage>
        )}

        {content.ctaLabel && content.ctaHref && (
          <Reveal delay={120}>
            <div className="mt-8 flex justify-center">
              <CmsLink
                href={content.ctaHref}
                className="group inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-5 py-2.5 text-sm font-semibold text-white backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:border-emerald-400/40 hover:bg-emerald-400/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
              >
                {content.ctaLabel}
                <ArrowRight className="h-4 w-4 text-emerald-300 transition-transform duration-200 group-hover:translate-x-0.5" />
              </CmsLink>
            </div>
          </Reveal>
        )}
      </Container>
    </section>
  );
}
