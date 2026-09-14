import { ArrowUpRight } from "lucide-react";
import type { PublicSection } from "@/lib/cms/sections";
import { Container, SectionHeading, Stage } from "./primitives";
import { stagger } from "./motion";
import { CmsIcon } from "./cmsIcon";
import { CmsLink } from "./CmsLink";

type Integration = PublicSection<"integrations">["items"]["integration"][number];

function Card({ item }: { item: Integration }) {
  return (
    <>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 shadow-sm shadow-slate-900/20 ring-1 ring-inset ring-white/10">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin-supplied logo URLs are arbitrary hosts
          <img src={item.imageUrl} alt="" loading="lazy" className="h-6 w-6 object-contain" />
        ) : (
          <CmsIcon name={item.icon} className="h-5 w-5 text-emerald-300" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold tracking-tight text-slate-900">{item.name}</span>
        {item.description && (
          <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{item.description}</span>
        )}
      </span>
      {item.href && (
        <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300 transition duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-emerald-600" />
      )}
    </>
  );
}

/** Tools and channels the platform connects with. A card with a link is clickable as a whole. */
export function Integrations({ section }: { section: PublicSection<"integrations"> }) {
  const integrations = section.items.integration;
  if (integrations.length === 0) return null;

  const cardClass =
    "group flex h-full items-start gap-3.5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-inset ring-slate-900/5 transition duration-300 hover:-translate-y-0.5 hover:shadow-md hover:ring-emerald-500/25";

  return (
    <section className="bg-white py-14 sm:py-16">
      <Container>
        <SectionHeading
          align="center"
          eyebrow={section.content.eyebrow}
          title={section.content.title}
          description={section.content.description}
        />

        <Stage className="mx-auto mt-8 grid max-w-5xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {integrations.map((item, i) => (
            <div key={item.id} style={stagger(i, 60)} className="wa-lift">
              {item.href ? (
                <CmsLink
                  href={item.href}
                  className={`${cardClass} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600`}
                >
                  <Card item={item} />
                </CmsLink>
              ) : (
                <div className={cardClass}>
                  <Card item={item} />
                </div>
              )}
            </div>
          ))}
        </Stage>
      </Container>
    </section>
  );
}
