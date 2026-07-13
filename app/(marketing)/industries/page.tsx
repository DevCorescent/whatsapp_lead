import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Building2,
  Car,
  Check,
  GraduationCap,
  HeartPulse,
  Landmark,
  ShoppingCart,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Industries — WhatsCRM",
  description:
    "How real estate, EdTech, e-commerce, healthcare, finance and automotive teams use WhatsCRM to capture and close leads on WhatsApp.",
};

const INDUSTRIES = [
  {
    Icon: Building2,
    name: "Real Estate",
    summary:
      "Property enquiries arrive on WhatsApp and go cold in a group chat. WhatsCRM captures every one and tells you which buyer is actually ready to visit.",
    useCases: [
      "Auto-reply with floor plans, price and location",
      "AI scores buyers on budget and timeline",
      "Site-visit follow-ups that never get forgotten",
    ],
  },
  {
    Icon: GraduationCap,
    name: "EdTech & Coaching",
    summary:
      "Admission season means hundreds of the same questions. Let AI answer fees, batches and syllabus while your counsellors call the serious students.",
    useCases: [
      "Instant answers on fees, batches and EMI",
      "Counsellor assignment by course interest",
      "Bulk campaigns for new batch launches",
    ],
  },
  {
    Icon: ShoppingCart,
    name: "E-commerce & D2C",
    summary:
      "Recover abandoned carts and handle order queries where your customers already are — WhatsApp beats email open rates by 5×.",
    useCases: [
      "Order status and shipping queries on autopilot",
      "Abandoned-cart and restock campaigns",
      "Returns and refunds tracked as tickets",
    ],
  },
  {
    Icon: HeartPulse,
    name: "Healthcare & Clinics",
    summary:
      "Appointment requests, reports and reminders in one shared inbox your front desk can actually keep up with.",
    useCases: [
      "Appointment booking and reminder messages",
      "Answer clinic timings and consultation fees",
      "Route enquiries to the right department",
    ],
  },
  {
    Icon: Landmark,
    name: "Finance & Insurance",
    summary:
      "Qualify loan and policy leads before an advisor picks up the phone, so their time goes to the applications most likely to convert.",
    useCases: [
      "AI qualification on income and eligibility",
      "Document collection over WhatsApp",
      "Renewal and premium-due reminders",
    ],
  },
  {
    Icon: Car,
    name: "Automotive",
    summary:
      "From first enquiry to test drive to service reminder — keep the whole customer lifecycle in one pipeline.",
    useCases: [
      "Test-drive booking straight from a chat",
      "Model, variant and finance queries answered",
      "Service and insurance renewal campaigns",
    ],
  },
];

export default function IndustriesPage() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-[#6C3FC4]/5 to-white py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
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
      <section className="pb-16 sm:pb-20 lg:pb-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {INDUSTRIES.map(({ Icon, name, summary, useCases }) => (
              <div
                key={name}
                className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 transition-shadow hover:shadow-lg"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#6C3FC4]/10">
                  <Icon className="h-6 w-6 text-[#6C3FC4]" />
                </span>

                <h2 className="mt-5 text-lg font-semibold text-gray-900">{name}</h2>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{summary}</p>

                <ul className="mt-5 flex-1 space-y-2.5">
                  {useCases.map((useCase) => (
                    <li key={useCase} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#6C3FC4]" />
                      <span className="text-sm text-gray-700">{useCase}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/register"
                  className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#6C3FC4] transition-colors hover:text-[#5A32A6]"
                >
                  Start free trial
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section className="pb-16 sm:pb-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-[#6C3FC4] px-6 py-14 text-center sm:px-12 sm:py-16">
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
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3.5 text-base font-semibold text-[#6C3FC4] shadow-lg transition-colors hover:bg-gray-100"
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
