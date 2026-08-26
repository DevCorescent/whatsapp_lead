"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLANS, annualMonthlyPrice, formatINR } from "@/components/marketing/plans";
import { Container, Reveal, SectionHeading, Stage } from "./primitives";
import { stagger } from "./motion";
import { useReducedMotion } from "./interactive";

/**
 * Pricing, read from the project's own plan data.
 *
 * `components/marketing/plans.ts` is the existing source for the marketing tiers and
 * is imported rather than duplicated, so the homepage and /pricing can never quote
 * different numbers. No price, limit or feature line is invented here.
 *
 * A separate component from `components/marketing/PricingPlans.tsx` on purpose: that
 * one is rendered by /pricing and is left exactly as it is.
 *
 * COMPACTED. The section used to open with a heading, a blurb, a toggle, a saving
 * chip, a pair of arrows and a row of dots — about four hundred pixels before a
 * price was visible. The arrows and dots are gone: on desktop all three cards are on
 * screen, so they steered nothing, and on a phone the track is a snap scroller that a
 * thumb already drives. Selection survives, because it is what marks the recommended
 * plan and what a tap on a card changes.
 *
 * Card order is the order a buyer reads in: name, who it is for, price, what you get,
 * then the button. The button last, at the bottom edge of every card, so the three
 * line up whatever their feature counts.
 */

type Cycle = "monthly" | "annual";

/** Growth in the sample data; whichever tier is marked popular in general. */
const DEFAULT_PLAN = PLANS.find((plan) => plan.isPopular)?.id ?? PLANS[0].id;

/** Five lines is a decision aid. The full comparison lives at /pricing. */
const MAX_FEATURES = 5;

export function Pricing() {
  const reduced = useReducedMotion();
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const isAnnual = cycle === "annual";

  const [selectedId, setSelectedId] = useState<string>(DEFAULT_PLAN);

  const track = useRef<HTMLDivElement>(null);
  const centred = useRef(false);

  // Centre the selected card in the track. Only ever touches the track's own scroll
  // position, never the document's — `scrollIntoView` would also scroll the page,
  // which on first mount would yank a visitor down to this section unasked.
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

  return (
    <section
      id="pricing"
      className="relative scroll-mt-20 overflow-hidden bg-gradient-to-b from-emerald-50/60 via-white to-white py-12 sm:py-14"
    >
      <Container>
        <SectionHeading
          align="center"
          eyebrow="Pricing"
          title="Plans that grow with your conversation volume"
          description="Simple plans that scale with your inbox."
        />

        <Reveal delay={80}>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
            {/* The selected pill slides between the two options rather than each
                button painting its own background: one element moving reads as a
                switch, two swapping colours reads as a repaint. */}
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
              Save 20% with annual billing
            </span>
          </div>
        </Reveal>

        {/* A snap carousel below lg, a three-column grid above it. `-mx-4 px-4` lets a
            card's shadow and its lifted state breathe without the track clipping them
            or the page gaining a horizontal scrollbar.

            Wrapped in a Stage because the cards are not each inside a Reveal: the
            staged feature rows key off a `data-shown` ancestor, and without one they
            sit at their resting opacity forever. */}
        <Stage>
          <div
            ref={track}
            className={cn(
              "scrollbar-slim mt-6 -mx-4 flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto px-4 pb-4 pt-4",
              "lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0",
            )}
          >
            {PLANS.map((plan, i) => {
              const price = isAnnual ? annualMonthlyPrice(plan.monthlyPrice) : plan.monthlyPrice;
              const isEnterprise = plan.id === "ENTERPRISE";
              const selected = plan.id === selectedId;
              const features = plan.features.slice(0, MAX_FEATURES);

              return (
                <div
                  key={plan.id}
                  data-plan={plan.id}
                  className="w-[85%] shrink-0 snap-center sm:w-[60%] lg:w-auto"
                >
                  {/* The card is a div, not a button. It has to contain a real link —
                      the CTA is the conversion path on this page, and a link nested
                      inside a button is invalid markup that no keyboard can reach. So
                      the header selects, and the CTA navigates. */}
                  <div
                    className={cn(
                      "relative flex h-full flex-col rounded-2xl bg-white p-5 transition-all duration-300",
                      selected
                        ? "shadow-xl shadow-emerald-900/10 ring-2 ring-emerald-500 lg:-translate-y-1.5"
                        : "shadow-sm ring-1 ring-inset ring-slate-900/5 hover:-translate-y-1 hover:shadow-lg hover:ring-emerald-500/25",
                    )}
                  >
                    {plan.isPopular && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white shadow-sm shadow-emerald-600/30">
                        Most Popular
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => setSelectedId(plan.id)}
                      aria-pressed={selected}
                      aria-label={`Select the ${plan.name} plan`}
                      className="wa-tap -m-1.5 rounded-xl p-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                    >
                      <span className="block text-lg font-semibold tracking-tight text-slate-900">
                        {plan.name}
                      </span>
                      <span className="mt-1 block text-[13px] leading-relaxed text-slate-600">
                        {plan.tagline}
                      </span>

                      {/* Keyed on the price so switching cycle re-runs the arrival
                          animation — the figure changing is the whole point of the
                          toggle, and it should be the thing that moves. */}
                      <span key={price} className="wa-swap mt-4 flex items-baseline gap-1.5">
                        <span className="nums text-[2rem] font-bold leading-none tracking-tight text-slate-900">
                          {formatINR(price)}
                        </span>
                        <span className="text-sm font-medium text-slate-500">/month</span>
                      </span>
                      <span className="mt-1.5 block text-[11px] text-slate-500">
                        {isAnnual ? (
                          <>
                            <span className="nums line-through">
                              {formatINR(plan.monthlyPrice)}
                            </span>{" "}
                            <span className="font-semibold text-emerald-600">20% off</span> · billed
                            annually
                          </>
                        ) : (
                          "Billed monthly · GST extra"
                        )}
                      </span>
                    </button>

                    <ul className="mt-4 flex-1 space-y-2 border-t border-slate-100 pt-4">
                      {features.map((feature, fi) => (
                        <li
                          key={feature}
                          style={stagger(fi, 55, 140 + i * 80)}
                          className="wa-lift flex items-start gap-2.5"
                        >
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                          <span className="text-[13px] leading-relaxed text-slate-700">
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <Link
                      href={isEnterprise ? "/contact" : `/register?plan=${plan.id}`}
                      className={cn(
                        "wa-tap mt-5 block rounded-xl px-4 py-2.5 text-center text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
                        selected
                          ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/25 hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-600/25"
                          : "bg-white text-emerald-700 ring-1 ring-inset ring-emerald-600/25 hover:-translate-y-0.5 hover:bg-emerald-50",
                      )}
                    >
                      {plan.cta}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </Stage>

        <Reveal delay={200}>
          <p className="mt-2 text-center text-sm text-slate-600">
            Need the full breakdown?{" "}
            <Link
              href="/pricing"
              className="font-semibold text-emerald-700 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-800"
            >
              Compare all plans →
            </Link>
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
