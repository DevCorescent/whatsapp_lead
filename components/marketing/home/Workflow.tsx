import type { PublicSection } from "@/lib/cms/sections";
import { cn } from "@/lib/utils";
import { Container, SectionHeading, Stage } from "./primitives";
import { stagger } from "./motion";
import { CmsIcon } from "./cmsIcon";
import { rowCols } from "./cmsLayout";

/**
 * How it works: the path a WhatsApp message takes, one step per column.
 *
 * Steps arrive left to right and each connector grows from the step before it, so
 * the section loading *is* a message travelling through the product. Connectors are
 * drawn only on `lg`, where every step sits on one row.
 *
 * `#how-it-works` lives here: the hero's secondary button and the nav point at it.
 * Renders inside DarkBand and paints no background of its own.
 */
export function Workflow({ section }: { section: PublicSection<"howItWorks"> }) {
  const { content } = section;
  const steps = section.items.step;

  return (
    <section id="how-it-works" className="relative scroll-mt-20 py-14 sm:py-16">
      <Container>
        <SectionHeading
          align="center"
          tone="dark"
          eyebrow={content.eyebrow}
          title={content.title}
          description={content.description}
        />

        {steps.length > 0 && (
          <Stage className="mt-10">
            <ol className={cn("grid gap-x-3 gap-y-8", steps.length > 1 && "sm:grid-cols-2", rowCols(steps.length))}>
              {steps.map((step, i) => (
                <li key={step.id} className="group relative flex flex-col items-center px-2 text-center">
                  {i > 0 && (
                    <span
                      aria-hidden
                      style={stagger(i, 180, 60)}
                      className="wa-grow-x absolute right-1/2 top-7 hidden h-px w-full origin-left bg-gradient-to-r from-emerald-400/15 via-emerald-400/60 to-emerald-300/80 lg:block"
                    >
                      <span className="wa-node-glow absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400" />
                    </span>
                  )}

                  <span
                    style={stagger(i, 180)}
                    className={cn(
                      "wa-pop relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl",
                      "border border-white/10 bg-white/[0.06] shadow-lg shadow-emerald-950/40 backdrop-blur",
                      "transition duration-300 group-hover:-translate-y-1 group-hover:border-emerald-400/40 group-hover:bg-emerald-400/10",
                    )}
                  >
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-2xl bg-emerald-400/15 blur-md transition-opacity duration-300 group-hover:bg-emerald-400/30"
                    />
                    <CmsIcon
                      name={step.icon}
                      className="wa-icon-tilt relative h-6 w-6 text-emerald-300 transition-colors duration-300 group-hover:text-emerald-200"
                    />
                    <span className="nums absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-slate-950 ring-2 ring-slate-950/80">
                      {i + 1}
                    </span>
                  </span>

                  <h3
                    style={stagger(i, 180, 90)}
                    className="wa-lift mt-4 text-sm font-semibold leading-tight text-white"
                  >
                    {step.title}
                  </h3>
                  {step.description && (
                    <p
                      style={stagger(i, 180, 140)}
                      className="wa-lift mt-1.5 max-w-[15rem] text-xs leading-relaxed text-slate-400"
                    >
                      {step.description}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </Stage>
        )}
      </Container>
    </section>
  );
}
