import type { PublicSection } from "@/lib/cms/sections";
import { Container, SectionHeading, Stage } from "./primitives";
import { stagger } from "./motion";
import { CmsIcon } from "./cmsIcon";

/** The WhatsApp formats the platform handles, as a compact grid of tiles. */
export function MessageTypes({ section }: { section: PublicSection<"messageTypes"> }) {
  const types = section.items.type;
  if (types.length === 0) return null;

  return (
    <section className="border-y border-slate-100 bg-slate-50/70 py-14 sm:py-16">
      <Container>
        <SectionHeading
          align="center"
          eyebrow={section.content.eyebrow}
          title={section.content.title}
          description={section.content.description}
        />

        <Stage className="mx-auto mt-8 grid max-w-5xl grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
          {types.map((type, i) => (
            <div
              key={type.id}
              style={stagger(i, 50)}
              className="wa-lift group flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-inset ring-slate-900/5 transition duration-300 hover:-translate-y-0.5 hover:shadow-md hover:ring-emerald-500/25"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-600/15 transition-colors duration-300 group-hover:bg-emerald-600">
                <CmsIcon name={type.icon} className="h-4.5 w-4.5 text-emerald-600 transition-colors duration-300 group-hover:text-white" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold tracking-tight text-slate-900">{type.label}</span>
                {type.description && (
                  <span className="mt-0.5 block text-xs leading-snug text-slate-500">{type.description}</span>
                )}
              </span>
            </div>
          ))}
        </Stage>
      </Container>
    </section>
  );
}
