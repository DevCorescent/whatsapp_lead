"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLANS, annualMonthlyPrice, formatINR } from "@/components/marketing/plans";
import { Container, Reveal, SectionHeading } from "./primitives";
import { stagger } from "./motion";

/**
 * Pricing, read from the project's own plan data.
 *
 * `components/marketing/plans.ts` is the existing source for the marketing tiers and is
 * imported rather than duplicated, so the homepage and /pricing can never quote
 * different numbers. No price, limit or feature line is invented here.
 *
 * A separate component from `components/marketing/PricingPlans.tsx` on purpose: that one
 * is rendered by /pricing and is left exactly as it is.
 */

type Cycle = "monthly" | "annual";

export function Pricing() {
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const isAnnual = cycle === "annual";

  return (
    <section
      id="pricing"
      className="relative scroll-mt-20 overflow-hidden bg-gradient-to-b from-white to-slate-50 py-20 sm:py-28"
    >
      <Container>
        <SectionHeading
          align="center"
          eyebrow="Pricing"
          title="Plans that grow with your conversation volume"
          description="Start on the plan that fits today. Move up when your inbox does."
        />

        <Reveal delay={80}>
          <div className="mt-10 flex flex-col items-center gap-3">
            <div
              role="group"
              aria-label="Billing cycle"
              className="inline-flex rounded-full bg-slate-100 p-1 ring-1 ring-inset ring-slate-900/5"
            >
              {(["monthly", "annual"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setCycle(option)}
                  aria-pressed={cycle === option}
                  className={cn(
                    "rounded-full px-5 py-2 text-sm font-semibold capitalize transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
                    cycle === option
                      ? "bg-white text-emerald-700 shadow-sm"
                      : "text-slate-600 hover:text-slate-900",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
              Save 20% with annual billing
            </span>
          </div>
        </Reveal>

        <div className="mt-12 grid items-start gap-6 lg:grid-cols-3">
          {PLANS.map((plan, i) => {
            const price = isAnnual ? annualMonthlyPrice(plan.monthlyPrice) : plan.monthlyPrice;
            const isEnterprise = plan.id === "ENTERPRISE";

            return (
              <Reveal key={plan.id} delay={i * 90}>
                <div
                  className={cn(
                    "wa-hover-lift relative flex h-full flex-col rounded-2xl p-8",
                    plan.isPopular
                      ? "wa-ring-settle bg-white shadow-xl shadow-emerald-900/10 ring-2 ring-emerald-500 lg:-translate-y-3 lg:hover:-translate-y-4"
                      : "bg-white shadow-sm ring-1 ring-inset ring-slate-900/5 hover:shadow-md hover:ring-emerald-500/25",
                  )}
                >
                  {plan.isPopular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white shadow-sm shadow-emerald-600/30">
                      Most Popular
                    </span>
                  )}

                  <h3 className="text-lg font-semibold tracking-tight text-slate-900">
                    {plan.name}
                  </h3>
                  <p className="mt-2 text-sm text-slate-600">{plan.tagline}</p>

                  <div className="mt-6">
                    <p className="flex items-baseline gap-1.5">
                      <span className="nums text-4xl font-bold tracking-tight text-slate-900">
                        {formatINR(price)}
                      </span>
                      <span className="text-sm font-medium text-slate-500">/month</span>
                    </p>
                    {isAnnual ? (
                      <p className="nums mt-2 text-xs text-slate-500">
                        <span className="line-through">{formatINR(plan.monthlyPrice)}</span>{" "}
                        <span className="font-semibold text-emerald-600">20% off</span> · billed
                        annually at {formatINR(price * 12)}
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">Billed monthly · GST extra</p>
                    )}
                  </div>

                  <Link
                    href={isEnterprise ? "/contact" : `/register?plan=${plan.id}`}
                    className={cn(
                      "mt-7 block rounded-xl px-4 py-3 text-center text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
                      plan.isPopular
                        ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/25 hover:bg-emerald-700"
                        : "bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:text-slate-900",
                    )}
                  >
                    {plan.cta}
                  </Link>

                  <ul className="mt-7 flex-1 space-y-3 border-t border-slate-100 pt-6">
                    {plan.features.map((feature, fi) => (
                      <li
                        key={feature}
                        style={stagger(fi, 55, 180 + i * 90)}
                        className="wa-lift flex items-start gap-2.5"
                      >
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        <span className="text-sm leading-relaxed text-slate-700">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            );
          })}
        </div>

        <Reveal delay={280}>
          <p className="mt-10 text-center text-sm text-slate-600">
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
