"use client";

import Link from "next/link";
import { useState } from "react";
import { Check } from "lucide-react";
import { PLANS, annualMonthlyPrice, formatINR } from "@/components/marketing/plans";

type BillingCycle = "monthly" | "annual";

export default function PricingPlans() {
  const [billing, setBilling] = useState<BillingCycle>("monthly");
  const isAnnual = billing === "annual";

  return (
    <div>
      {/* Monthly / Annual toggle */}
      <div className="flex flex-col items-center gap-3">
        <div
          role="group"
          aria-label="Billing cycle"
          className="inline-flex rounded-full border border-gray-200 bg-gray-100 p-1"
        >
          <button
            type="button"
            onClick={() => setBilling("monthly")}
            aria-pressed={!isAnnual}
            className={
              !isAnnual
                ? "rounded-full bg-white px-5 py-2 text-sm font-semibold text-[#6C3FC4] shadow-sm"
                : "rounded-full px-5 py-2 text-sm font-semibold text-gray-600 transition-colors hover:text-gray-900"
            }
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBilling("annual")}
            aria-pressed={isAnnual}
            className={
              isAnnual
                ? "rounded-full bg-white px-5 py-2 text-sm font-semibold text-[#6C3FC4] shadow-sm"
                : "rounded-full px-5 py-2 text-sm font-semibold text-gray-600 transition-colors hover:text-gray-900"
            }
          >
            Annual
          </button>
        </div>
        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
          Save 20% with annual billing
        </span>
      </div>

      {/* Plan cards */}
      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const price = isAnnual ? annualMonthlyPrice(plan.monthlyPrice) : plan.monthlyPrice;

          return (
            <div
              key={plan.id}
              className={
                plan.isPopular
                  ? "relative flex flex-col rounded-2xl border-2 border-[#6C3FC4] bg-white p-8 shadow-xl"
                  : "relative flex flex-col rounded-2xl border border-gray-200 bg-white p-8"
              }
            >
              {plan.isPopular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#6C3FC4] px-3 py-1 text-xs font-semibold text-white">
                  Most Popular
                </span>
              )}

              <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
              <p className="mt-2 text-sm text-gray-600">{plan.tagline}</p>

              <div className="mt-6">
                <p className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold tracking-tight text-gray-900">
                    {formatINR(price)}
                  </span>
                  <span className="text-sm font-medium text-gray-500">/month</span>
                </p>

                {isAnnual ? (
                  <p className="mt-2 text-sm text-gray-500">
                    <span className="line-through">{formatINR(plan.monthlyPrice)}</span>{" "}
                    <span className="font-semibold text-green-600">20% off</span> · billed annually
                    at {formatINR(price * 12)}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-gray-500">Billed monthly · GST extra</p>
                )}
              </div>

              <ul className="mt-8 flex-1 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#6C3FC4]" />
                    <span className="text-sm text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={
                  plan.id === "ENTERPRISE" ? "/contact" : `/register?plan=${plan.id}`
                }
                className={
                  plan.isPopular
                    ? "mt-8 block rounded-lg bg-[#6C3FC4] px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-[#5A32A6]"
                    : "mt-8 block rounded-lg border border-gray-300 px-4 py-3 text-center text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                }
              >
                {plan.cta}
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
