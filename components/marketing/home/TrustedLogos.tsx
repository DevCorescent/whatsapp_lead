import type { PublicSection } from "@/lib/cms/sections";
import { Container } from "./primitives";
import { CmsLink } from "./CmsLink";

/**
 * The trust strip under the hero.
 *
 * Wordmarks by default — the shipped items are the kinds of business the product
 * serves, not customer logos, because there are no customer logos anyone has
 * agreed to publish. Once the client adds real logo images they render here in
 * muted greyscale, lifting to full colour on hover.
 */
export function TrustedLogos({ section }: { section: PublicSection<"logos"> }) {
  const logos = section.items.logo;
  if (logos.length === 0) return null;

  return (
    <section aria-label={section.content.title || "Trusted by"} className="border-y border-slate-100 bg-white py-7 sm:py-8">
      <Container>
        {section.content.title && (
          <p className="text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            {section.content.title}
          </p>
        )}
        <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 sm:gap-x-12">
          {logos.map((logo) => {
            const mark = logo.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- admin-supplied logo URLs are arbitrary hosts, which next/image would need configured one by one
              <img
                src={logo.imageUrl}
                alt={logo.name}
                loading="lazy"
                className="h-7 w-auto max-w-[8.5rem] object-contain opacity-60 grayscale transition duration-300 hover:opacity-100 hover:grayscale-0"
              />
            ) : (
              <span className="text-[15px] font-semibold tracking-tight text-slate-400 transition-colors duration-300 hover:text-slate-700">
                {logo.name}
              </span>
            );

            return (
              <li key={logo.id}>
                {logo.href ? (
                  <CmsLink href={logo.href} ariaLabel={logo.name} className="block rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600">
                    {mark}
                  </CmsLink>
                ) : (
                  mark
                )}
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
