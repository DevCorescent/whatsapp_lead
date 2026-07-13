import type { ReactNode } from "react";

export type LegalSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
};

/**
 * Shared shell for the three legal pages. Tailwind v4 here has no typography
 * plugin, so the text styles are applied explicitly rather than via `prose`.
 */
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
      <section className="border-b border-gray-200 bg-gradient-to-b from-[#6C3FC4]/5 to-white py-14 sm:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 text-sm text-gray-500">Last updated: {lastUpdated}</p>
          <p className="mt-6 text-base leading-relaxed text-gray-600">{intro}</p>
        </div>
      </section>

      <section className="py-14 sm:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="space-y-10">
            {sections.map((section, index) => (
              <div key={section.heading}>
                <h2 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">
                  {index + 1}. {section.heading}
                </h2>

                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph} className="mt-4 text-base leading-relaxed text-gray-600">
                    {paragraph}
                  </p>
                ))}

                {section.bullets && (
                  <ul className="mt-4 list-disc space-y-2 pl-5">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="text-base leading-relaxed text-gray-600">
                        {bullet}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          {footer && (
            <div className="mt-12 rounded-2xl border border-gray-200 bg-gray-50 p-6">{footer}</div>
          )}
        </div>
      </section>
    </div>
  );
}
