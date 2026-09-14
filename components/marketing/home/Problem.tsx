import { ArrowDown } from "lucide-react";
import type { PublicSection } from "@/lib/cms/sections";
import { cn } from "@/lib/utils";
import { Container, Reveal, SectionHeading, Stage } from "./primitives";
import { stagger } from "./motion";
import { CmsIcon } from "./cmsIcon";
import { balancedCols } from "./cmsLayout";

/** Meter colours, cycled by position so any number of cards stays varied. */
const METER_TONES = [
  "from-amber-400 to-rose-500",
  "from-emerald-400 to-emerald-500",
  "from-slate-300 to-slate-400",
  "from-sky-300 to-violet-400",
];

/**
 * The problem, as readings off an unmanaged inbox.
 *
 * Each card leads with its value — the value is the argument, and the label under it
 * names the figure rather than explaining it. Server component: nothing here is
 * interactive; the arrival animation is CSS keyed off one observer.
 */
export function Problem({ section }: { section: PublicSection<"problem"> }) {
  const { content } = section;
  const cards = section.items.card;

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-emerald-50/50 via-white to-white py-14 sm:py-16">
      <Container>
        <SectionHeading
          align="center"
          eyebrow={content.eyebrow}
          title={content.title}
          description={content.description}
        />

        {cards.length > 0 && (
          <Stage className={cn("mt-8 grid gap-3 sm:grid-cols-2", balancedCols(cards.length))}>
            {cards.map((card, i) => (
              <div
                key={card.id}
                style={stagger(i, 90)}
                className="wa-lift group rounded-2xl bg-white p-5 shadow-sm ring-1 ring-inset ring-slate-900/5 transition duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-900/5 hover:ring-slate-900/10"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-inset ring-slate-900/5 transition-colors duration-300 group-hover:bg-rose-50 group-hover:ring-rose-500/15">
                  <CmsIcon
                    name={card.icon}
                    className="h-4 w-4 text-slate-400 transition-colors duration-300 group-hover:text-rose-500"
                  />
                </span>

                <p className="nums mt-3.5 text-2xl font-bold tracking-tight text-slate-900 sm:text-[1.75rem]">
                  {card.value}
                </p>
                <p className="mt-0.5 text-sm font-medium text-slate-700">{card.label}</p>

                {card.meter > 0 && (
                  <span className="mt-3 block h-1 overflow-hidden rounded-full bg-slate-100">
                    <span
                      style={{ width: `${Math.min(card.meter, 100)}%`, ...stagger(i, 90, 260) }}
                      className={cn(
                        "wa-grow-x block h-full rounded-full bg-gradient-to-r",
                        METER_TONES[i % METER_TONES.length],
                      )}
                    />
                  </span>
                )}

                {card.description && (
                  <p className="mt-3 text-xs leading-relaxed text-slate-500">{card.description}</p>
                )}
              </div>
            ))}
          </Stage>
        )}

        {content.closing && (
          <Reveal delay={180}>
            <div className="mt-8 flex flex-col items-center gap-2">
              <ArrowDown aria-hidden className="h-4 w-4 text-emerald-500" />
              <p className="text-center text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
                {content.closing}
              </p>
            </div>
          </Reveal>
        )}
      </Container>
    </section>
  );
}
