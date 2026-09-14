"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { PublicSection } from "@/lib/cms/sections";
import { cn } from "@/lib/utils";
import { Container, Reveal, SectionHeading } from "./primitives";

/**
 * Homepage FAQ, from the CMS "FAQ" section.
 *
 * A separate accordion from components/marketing/FaqAccordion.tsx, which /pricing
 * renders with its own questions and palette.
 *
 * Every question starts CLOSED and opens only when the visitor clicks or taps it —
 * opening one on load answers a question nobody asked and pushes the rest of the
 * list down before it can be scanned.
 */
export function Faq({ section }: { section: PublicSection<"faq"> }) {
  const [open, setOpen] = useState<string | null>(null);
  const faqs = section.items.faq;

  if (faqs.length === 0) return null;

  return (
    <section
      id="faq"
      className="relative scroll-mt-20 overflow-hidden bg-gradient-to-b from-white to-emerald-50/40 py-14 sm:py-16"
    >
      <Container>
        <SectionHeading
          align="center"
          eyebrow={section.content.eyebrow}
          title={section.content.title}
          description={section.content.description}
        />

        <Reveal delay={80}>
          <div className="mx-auto mt-8 max-w-3xl divide-y divide-slate-200 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-inset ring-slate-900/5">
            {faqs.map((faq) => {
              const isOpen = open === faq.id;
              const triggerId = `home-faq-trigger-${faq.id}`;
              const panelId = `home-faq-panel-${faq.id}`;

              return (
                <div key={faq.id}>
                  <h3>
                    <button
                      type="button"
                      id={triggerId}
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => setOpen(isOpen ? null : faq.id)}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600 sm:px-6"
                    >
                      <span className="text-sm font-semibold text-slate-900 sm:text-base">{faq.question}</span>
                      <span
                        aria-hidden
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ring-inset transition duration-300",
                          isOpen ? "bg-emerald-600 ring-emerald-600" : "bg-white ring-slate-200",
                        )}
                      >
                        <Plus
                          className={cn(
                            "h-4 w-4 transition-transform duration-300",
                            isOpen ? "rotate-45 text-white" : "text-slate-500",
                          )}
                        />
                      </span>
                    </button>
                  </h3>

                  {/* Grid-rows transition: the panel animates to its real height. */}
                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={triggerId}
                    className={cn(
                      "grid transition-all duration-300 ease-out",
                      isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                    )}
                  >
                    <div className="overflow-hidden" inert={!isOpen}>
                      <p className="whitespace-pre-line px-5 pb-4 text-sm leading-relaxed text-slate-600 sm:px-6">
                        {faq.answer}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
