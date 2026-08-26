import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Check } from "lucide-react";
import { INDUSTRIES } from "@/components/marketing/industries";

export const metadata: Metadata = {
  title: "Industries — WhatsCRM",
  description:
    "How real estate, EdTech, e-commerce, healthcare, finance and automotive teams use WhatsCRM to capture and close leads on WhatsApp.",
};


export default function IndustriesPage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-gradient-to-b from-white via-emerald-50/60 to-white py-16 sm:py-20">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[30rem] w-[52rem] -translate-x-1/2 -translate-y-1/3 rounded-full bg-[radial-gradient(closest-side,rgba(16,185,129,0.16),transparent_100%)]"
        />
        <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
            Built for the way your industry sells
          </h1>
          <p className="mt-6 text-base text-gray-600 sm:text-lg">
            Every business closes deals differently. Here is how teams across six industries use
            WhatsCRM to turn WhatsApp conversations into revenue.
          </p>
        </div>
      </section>

      {/* Industry cards */}
      <section className="bg-gradient-to-b from-white to-emerald-50/40 pb-16 pt-4 sm:pb-20 lg:pb-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {/* `id` is the deep-link target the site map and the footer point at, so
                every industry is addressable without a page of its own. */}
            {INDUSTRIES.map(({ id, Icon, name, summary, useCases }) => (
              <div
                key={name}
                id={id}
                className="group flex scroll-mt-24 flex-col rounded-2xl border border-gray-200 bg-white p-6 transition duration-300 hover:-translate-y-1 hover:border-emerald-500/30 hover:shadow-lg hover:shadow-emerald-900/5"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600/10">
                  <Icon className="h-6 w-6 text-emerald-600" />
                </span>

                <h2 className="mt-5 text-lg font-semibold text-gray-900">{name}</h2>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{summary}</p>

                <ul className="mt-5 flex-1 space-y-2.5">
                  {useCases.map((useCase) => (
                    <li key={useCase} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <span className="text-sm text-gray-700">{useCase}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/register"
                  className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-emerald-600 transition-colors hover:text-emerald-700"
                >
                  Start free trial
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA banner. Picks the wash up where the card grid left it, so the two bands
          read as one section rather than as a colour that stops mid-page. */}
      <section className="bg-gradient-to-b from-emerald-50/40 to-white pb-16 sm:pb-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-emerald-600 px-6 py-14 text-center sm:px-12 sm:py-16">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Not sure how it fits your business?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-white/80 sm:text-lg">
              Tell us how your team sells today and we will show you exactly what WhatsCRM would
              change.
            </p>
            <div className="mt-8">
              <Link
                href="/contact"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3.5 text-base font-semibold text-emerald-600 shadow-lg transition-colors hover:bg-gray-100"
              >
                Book a Demo
                <ArrowRight className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
