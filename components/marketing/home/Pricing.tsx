"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import type { PublicSection } from "@/lib/cms/sections";
import { annualMonthlyPrice, formatPlanPrice } from "@/lib/cms/pricing";
import { cn } from "@/lib/utils";
import { Container, Reveal, SectionHeading, Stage } from "./primitives";
import { stagger } from "./motion";
import { useReducedMotion } from "./interactive";
import { CmsLink } from "./CmsLink";

/**
 * Homepage pricing, from the CMS "Pricing" section — the same plans /pricing shows,
 * so the two pages can never quote different numbers.
 *
 * Compact on purpose: name, who it is for, price, five lines of features, button.
 * The full breakdown lives at /pricing. Tapping a card's header selects it, and the
 * selected card is the highlighted one; it starts on the featured plan.
 *
 * A snap carousel below `lg`, a grid above it.
 */

type Cycle = "monthly" | "annual";

const MAX_FEATURES = 5;

const GRID: Record<number, string> = {
  1: "lg:mx-auto lg:max-w-sm lg:grid-cols-1",
  2: "lg:mx-auto lg:max-w-3xl lg:grid-cols-2",
  3: "lg:mx-0 lg:grid-cols-3",
  4: "lg:mx-0 lg:grid-cols-4",
};

export function Pricing({ section }: { section: PublicSection<"pricing"> }) {
  const { content } = section;
  const plans = section.items.plan;
  const reduced = useReducedMotion();

  const discount = Math.min(Math.max(content.annualDiscountPercent, 0), 90);
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const isAnnual = discount > 0 && cycle === "annual";

  const [selectedId, setSelectedId] = useState<string>(
    () => plans.find((plan) => plan.isPopular)?.id ?? plans[0]?.id ?? "",
  );

  const track = useRef<HTMLDivElement>(null);
  const centred = useRef(false);

  // Centre the selected card in the carousel. Only the track scrolls — never the
  // document, which would yank a visitor down to this section on first load.
  useEffect(() => {
    const node = track.current;
    if (!node) return;
    const card = node.querySelector<HTMLElement>(`[data-plan="${selectedId}"]`);
    if (!card) return;

    const left = card.offsetLeft - (node.clientWidth - card.clientWidth) / 2;
    const first = !centred.current;
    centred.current = true;
    node.scrollTo({ left, behavior: first || reduced ? "auto" : "smooth" });
  }, [selectedId, reduced]);

  if (plans.length === 0) return null;

  return (
    <section
      id="pricing"
      className="relative scroll-mt-20 overflow-hidden bg-gradient-to-b from-emerald-50/60 via-white to-white py-14 sm:py-16"
    >
      <Container>
        <SectionHeading
          align="center"
          eyebrow={content.eyebrow}
          title={content.title}
          description={content.description}
        />

        {discount > 0 && (
          <Reveal delay={80}>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
              <div
                role="group"
                aria-label="Billing cycle"
                className="relative inline-flex rounded-full bg-slate-100 p-1 ring-1 ring-inset ring-slate-900/5"
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-y-1 left-1 w-[6.5rem] rounded-full bg-white shadow-sm transition-transform duration-300 ease-out",
                    isAnnual && "translate-x-full",
                  )}
                />
                {(["monthly", "annual"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setCycle(option)}
                    aria-pressed={cycle === option}
                    className={cn(
                      "wa-tap relative z-10 w-[6.5rem] rounded-full py-2 text-sm font-semibold capitalize transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
                      cycle === option ? "text-emerald-700" : "text-slate-600 hover:text-slate-900",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>

              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                Save {discount}% with annual billing
              </span>
            </div>
          </Reveal>
        )}

        <Stage>
          <div
            ref={track}
            className={cn(
              "scrollbar-slim -mx-4 mt-6 flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto px-4 pb-4 pt-4",
              "lg:grid lg:overflow-visible lg:px-0",
              GRID[Math.min(plans.length, 4)],
            )}
          >
            {plans.map((plan, i) => {
              const price = isAnnual ? annualMonthlyPrice(plan.price, discount) : plan.price;
              const selected = plan.id === selectedId;
              const features = plan.features.slice(0, MAX_FEATURES);

              return (
                <div key={plan.id} data-plan={plan.id} className="w-[85%] shrink-0 snap-center sm:w-[60%] lg:w-auto">
                  {/* A div, not a button: it contains a real link. The header selects, the button navigates. */}
                  <div
                    className={cn(
                      "relative flex h-full flex-col rounded-2xl bg-white p-5 transition-all duration-300",
                      selected
                        ? "shadow-xl shadow-emerald-900/10 ring-2 ring-emerald-500 lg:-translate-y-1.5"
                        : "shadow-sm ring-1 ring-inset ring-slate-900/5 hover:-translate-y-1 hover:shadow-lg hover:ring-emerald-500/25",
                    )}
                  >
                    {plan.isPopular && content.popularLabel && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white shadow-sm shadow-emerald-600/30">
                        {content.popularLabel}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => setSelectedId(plan.id)}
                      aria-pressed={selected}
                      aria-label={`Select the ${plan.name} plan`}
                      className="wa-tap -m-1.5 rounded-xl p-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                    >
                      <span className="block text-lg font-semibold tracking-tight text-slate-900">{plan.name}</span>
                      {plan.subtitle && (
                        <span className="mt-1 block text-[13px] leading-relaxed text-slate-600">{plan.subtitle}</span>
                      )}

                      <span key={price} className="wa-swap mt-4 flex items-baseline gap-1.5">
                        <span className="nums text-[2rem] font-bold leading-none tracking-tight text-slate-900">
                          {formatPlanPrice(content.currency, price)}
                        </span>
                        {plan.period && <span className="text-sm font-medium text-slate-500">{plan.period}</span>}
                      </span>
                      <span className="mt-1.5 block min-h-[1rem] text-[11px] text-slate-500">
                        {isAnnual ? (
                          <>
                            <span className="nums line-through">{formatPlanPrice(content.currency, plan.price)}</span>{" "}
                            <span className="font-semibold text-emerald-600">{discount}% off</span> · billed annually
                          </>
                        ) : (
                          content.priceNote
                        )}
                      </span>
                    </button>

                    {features.length > 0 && (
                      <ul className="mt-4 flex-1 space-y-2 border-t border-slate-100 pt-4">
                        {features.map((feature, fi) => (
                          <li
                            key={`${feature}-${fi}`}
                            style={stagger(fi, 55, 140 + i * 80)}
                            className="wa-lift flex items-start gap-2.5"
                          >
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                            <span className="text-[13px] leading-relaxed text-slate-700">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    <CmsLink
                      href={plan.ctaHref}
                      className={cn(
                        "wa-tap mt-5 block rounded-xl px-4 py-2.5 text-center text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
                        selected
                          ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/25 hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-600/25"
                          : "bg-white text-emerald-700 ring-1 ring-inset ring-emerald-600/25 hover:-translate-y-0.5 hover:bg-emerald-50",
                      )}
                    >
                      {plan.ctaLabel}
                    </CmsLink>
                  </div>
                </div>
              );
            })}
          </div>
        </Stage>

        {content.compareLabel && content.compareHref && (
          <Reveal delay={200}>
            <p className="mt-2 text-center text-sm">
              <CmsLink
                href={content.compareHref}
                className="font-semibold text-emerald-700 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-800"
              >
                {content.compareLabel} →
              </CmsLink>
            </p>
          </Reveal>
        )}
      </Container>
    </section>
  );
}
