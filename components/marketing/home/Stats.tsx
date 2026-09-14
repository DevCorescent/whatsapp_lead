import type { PublicSection } from "@/lib/cms/sections";
import { cn } from "@/lib/utils";
import { Container, Stage } from "./primitives";
import { stagger } from "./motion";

const COLS: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
};

/**
 * Headline numbers in one hairline-divided panel.
 *
 * The dividers are cell borders pulled back by a negative margin rather than a
 * `gap-px` over a tinted background, so an odd count on a two-column phone
 * leaves white space instead of a grey hole.
 */
export function Stats({ section }: { section: PublicSection<"stats"> }) {
  const stats = section.items.stat;
  if (stats.length === 0) return null;

  return (
    <section className="bg-white pb-2 pt-10 sm:pt-12">
      <Container>
        {section.content.title && (
          <h2 className="mb-5 text-center text-lg font-semibold tracking-tight text-slate-900">
            {section.content.title}
          </h2>
        )}
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-inset ring-slate-900/5">
          <Stage className={cn("-ml-px -mt-px grid grid-cols-2", COLS[Math.min(stats.length, 4)])}>
            {stats.map((stat, i) => (
              <div
                key={stat.id}
                style={stagger(i, 80)}
                className="wa-lift border-l border-t border-slate-100 px-4 py-5 sm:px-6 sm:py-6"
              >
                <p className="nums bg-gradient-to-br from-emerald-600 to-teal-500 bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-[2rem]">
                  {stat.value}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{stat.label}</p>
                {stat.description && (
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{stat.description}</p>
                )}
              </div>
            ))}
          </Stage>
        </div>
      </Container>
    </section>
  );
}
