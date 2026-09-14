import { Quote } from "lucide-react";
import type { PublicSection } from "@/lib/cms/sections";
import { cn } from "@/lib/utils";
import { Container, SectionHeading, Stage } from "./primitives";
import { stagger } from "./motion";

const GRID: Record<number, string> = {
  1: "mx-auto max-w-xl",
  2: "mx-auto max-w-4xl md:grid-cols-2",
  3: "md:grid-cols-2 lg:grid-cols-3",
};

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/**
 * Customer quotes.
 *
 * Renders nothing until the client activates at least one quote in the CMS: the
 * shipped items are inactive placeholders, and an empty testimonial section — or
 * an invented one — is worse than none.
 */
export function Testimonials({ section }: { section: PublicSection<"testimonials"> }) {
  const quotes = section.items.testimonial;
  if (quotes.length === 0) return null;

  return (
    <section className="bg-white py-14 sm:py-16">
      <Container>
        <SectionHeading
          align="center"
          eyebrow={section.content.eyebrow}
          title={section.content.title}
          description={section.content.description}
        />

        <Stage className={cn("mt-8 grid gap-4", GRID[Math.min(quotes.length, 3)])}>
          {quotes.map((item, i) => (
            <figure
              key={item.id}
              style={stagger(i, 90)}
              className="wa-lift flex h-full flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-inset ring-slate-900/5 sm:p-6"
            >
              <Quote aria-hidden className="h-6 w-6 text-emerald-500/70" />
              <blockquote className="mt-3 flex-1 text-[15px] leading-relaxed text-slate-700">
                “{item.quote}”
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-4">
                {item.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin-supplied photo URLs are arbitrary hosts
                  <img src={item.avatarUrl} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-semibold text-white">
                    {initialsOf(item.name)}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900">{item.name}</span>
                  {(item.role || item.company) && (
                    <span className="block truncate text-xs text-slate-500">
                      {[item.role, item.company].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
              </figcaption>
            </figure>
          ))}
        </Stage>
      </Container>
    </section>
  );
}
