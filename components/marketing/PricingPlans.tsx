"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import type { PublicSection } from "@/lib/cms/sections";
import { annualMonthlyPrice, formatPlanPrice } from "@/lib/cms/pricing";
import { CmsLink } from "@/components/marketing/home/CmsLink";

type BillingCycle = "monthly" | "annual";

/**
 * The /pricing plan cards: the CMS "Pricing" section with every feature listed.
 * The homepage shows the same plans in a compact form.
 */
export default function PricingPlans({ section }: { section: PublicSection<"pricing"> }) {
  const { content } = section;
  const plans = section.items.plan;
  const discount = Math.min(Math.max(content.annualDiscountPercent, 0), 90);

  const [billing, setBilling] = useState<BillingCycle>("monthly");
  const isAnnual = discount > 0 && billing === "annual";

  if (plans.length === 0) return null;

  return (
    <div>
      {discount > 0 && (
        <div className="flex flex-col items-center gap-3">
          <div role="group" aria-label="Billing cycle" className="inline-flex rounded-full border border-gray-200 bg-gray-100 p-1">
            {(["monthly", "annual"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setBilling(option)}
                aria-pressed={billing === option}
                className={
                  billing === option
                    ? "rounded-full bg-white px-5 py-2 text-sm font-semibold capitalize text-emerald-600 shadow-sm"
                    : "rounded-full px-5 py-2 text-sm font-semibold capitalize text-gray-600 transition-colors hover:text-gray-900"
                }
              >
                {option}
              </button>
            ))}
          </div>
          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
            Save {discount}% with annual billing
          </span>
        </div>
      )}

      <div className={`mt-12 grid gap-6 ${plans.length >= 3 ? "lg:grid-cols-3" : "mx-auto max-w-3xl md:grid-cols-2"} ${plans.length === 4 ? "xl:grid-cols-4" : ""}`}>
        {plans.map((plan) => {
          const price = isAnnual ? annualMonthlyPrice(plan.price, discount) : plan.price;

          return (
            <div
              key={plan.id}
              className={
                plan.isPopular
                  ? "relative flex flex-col rounded-2xl border-2 border-emerald-600 bg-white p-8 shadow-xl"
                  : "relative flex flex-col rounded-2xl border border-gray-200 bg-white p-8"
              }
            >
              {plan.isPopular && content.popularLabel && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                  {content.popularLabel}
                </span>
              )}

              <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
              {plan.subtitle && <p className="mt-2 text-sm text-gray-600">{plan.subtitle}</p>}

              <div className="mt-6">
                <p className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold tracking-tight text-gray-900">
                    {formatPlanPrice(content.currency, price)}
                  </span>
                  {plan.period && <span className="text-sm font-medium text-gray-500">{plan.period}</span>}
                </p>

                {isAnnual ? (
                  <p className="mt-2 text-sm text-gray-500">
                    <span className="line-through">{formatPlanPrice(content.currency, plan.price)}</span>{" "}
                    <span className="font-semibold text-green-600">{discount}% off</span> · billed annually at{" "}
                    {formatPlanPrice(content.currency, price * 12)}
                  </p>
                ) : (
                  content.priceNote && <p className="mt-2 text-sm text-gray-500">{content.priceNote}</p>
                )}
              </div>

              <ul className="mt-8 flex-1 space-y-3">
                {plan.features.map((feature, index) => (
                  <li key={`${feature}-${index}`} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span className="text-sm text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>

              <CmsLink
                href={plan.ctaHref}
                className={
                  plan.isPopular
                    ? "mt-8 block rounded-lg bg-emerald-600 px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                    : "mt-8 block rounded-lg border border-gray-300 px-4 py-3 text-center text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                }
              >
                {plan.ctaLabel}
              </CmsLink>
            </div>
          );
        })}
      </div>
    </div>
  );
}
