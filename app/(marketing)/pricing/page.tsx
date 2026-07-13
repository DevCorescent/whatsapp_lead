import Link from "next/link";
import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";
import PricingPlans from "@/components/marketing/PricingPlans";
import FaqAccordion, { type FaqItem } from "@/components/marketing/FaqAccordion";

export const metadata: Metadata = {
  title: "Pricing — WhatsCRM",
  description:
    "Simple, transparent pricing for WhatsCRM. Starter ₹999/mo, Growth ₹2,999/mo, Enterprise ₹9,999/mo. Save 20% with annual billing.",
};

type ComparisonRow = {
  feature: string;
  starter: string | boolean;
  growth: string | boolean;
  enterprise: string | boolean;
};

const COMPARISON_GROUPS: { group: string; rows: ComparisonRow[] }[] = [
  {
    group: "Limits",
    rows: [
      { feature: "Contacts", starter: "1,000", growth: "10,000", enterprise: "Unlimited" },
      {
        feature: "Messages per month",
        starter: "5,000",
        growth: "50,000",
        enterprise: "Unlimited",
      },
      { feature: "Agent seats", starter: "3", growth: "10", enterprise: "Unlimited" },
      { feature: "WhatsApp numbers", starter: "1", growth: "3", enterprise: "Unlimited" },
    ],
  },
  {
    group: "Core CRM",
    rows: [
      { feature: "Shared WhatsApp inbox", starter: true, growth: true, enterprise: true },
      { feature: "Contact management", starter: true, growth: true, enterprise: true },
      { feature: "Lead pipeline (Kanban)", starter: true, growth: true, enterprise: true },
      { feature: "Internal notes & assignment", starter: true, growth: true, enterprise: true },
      { feature: "Support tickets", starter: false, growth: true, enterprise: true },
    ],
  },
  {
    group: "AI & Automation",
    rows: [
      { feature: "AI auto-reply", starter: false, growth: true, enterprise: true },
      { feature: "AI lead qualification (BANT)", starter: false, growth: true, enterprise: true },
      { feature: "AI conversation summary", starter: false, growth: true, enterprise: true },
      { feature: "Knowledge base (RAG)", starter: false, growth: true, enterprise: true },
      { feature: "Chatbot flow builder", starter: false, growth: true, enterprise: true },
    ],
  },
  {
    group: "Growth tools",
    rows: [
      { feature: "Bulk campaigns", starter: false, growth: true, enterprise: true },
      { feature: "Message templates", starter: true, growth: true, enterprise: true },
      { feature: "Analytics dashboard", starter: "Basic", growth: "Advanced", enterprise: "Custom" },
      { feature: "API access", starter: false, growth: false, enterprise: true },
      { feature: "White label & custom domain", starter: false, growth: false, enterprise: true },
    ],
  },
  {
    group: "Support",
    rows: [
      {
        feature: "Support channel",
        starter: "Email",
        growth: "Priority email + chat",
        enterprise: "24×7 dedicated",
      },
      { feature: "Onboarding assistance", starter: false, growth: true, enterprise: true },
      { feature: "Dedicated account manager", starter: false, growth: false, enterprise: true },
      { feature: "Uptime SLA", starter: false, growth: false, enterprise: "99.9%" },
    ],
  },
];

const FAQS: FaqItem[] = [
  {
    question: "Do I need a credit card to start the free trial?",
    answer:
      "No. Every plan comes with a 14-day free trial and you can sign up with just your email. We only ask for payment details when you decide to continue after the trial ends.",
  },
  {
    question: "What exactly counts as a message?",
    answer:
      "Every message sent or received through your connected WhatsApp Business number counts once against your monthly limit. AI auto-replies count as outbound messages. Internal notes between your agents are always free.",
  },
  {
    question: "Can I change my plan later?",
    answer:
      "Yes. You can upgrade, downgrade or cancel at any time from the billing section of your dashboard. Upgrades apply immediately and we prorate the difference; downgrades take effect at the start of your next billing cycle.",
  },
  {
    question: "How does annual billing save me 20%?",
    answer:
      "When you choose annual billing you pay for twelve months upfront at a 20% discount on the monthly price. For example, the Growth plan drops from ₹2,999 to ₹2,399 per month, billed once a year.",
  },
  {
    question: "Do I need my own WhatsApp Business API account?",
    answer:
      "You need a WhatsApp Business number, and we help you connect it to the official Meta Cloud API during onboarding. It usually takes under five minutes and there is no coding involved. WhatsApp's own conversation charges are billed by Meta separately.",
  },
  {
    question: "What happens to my data if I cancel?",
    answer:
      "Your workspace stays accessible in read-only mode for 30 days after cancellation, so you can export contacts, conversations and leads as CSV. After 30 days we permanently delete your data from our systems.",
  },
];

function ComparisonCell({ value }: { value: string | boolean }) {
  if (value === true) {
    return (
      <span className="flex justify-center">
        <Check className="h-5 w-5 text-[#6C3FC4]" aria-hidden="true" />
        <span className="sr-only">Included</span>
      </span>
    );
  }

  if (value === false) {
    return (
      <span className="flex justify-center">
        <Minus className="h-5 w-5 text-gray-300" aria-hidden="true" />
        <span className="sr-only">Not included</span>
      </span>
    );
  }

  return <span className="block text-center text-sm text-gray-700">{value}</span>;
}

export default function PricingPage() {
  return (
    <div>
      {/* Header + cards */}
      <section className="bg-gradient-to-b from-[#6C3FC4]/5 to-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
              Simple, transparent pricing
            </h1>
            <p className="mt-5 text-base text-gray-600 sm:text-lg">
              Pick the plan that fits your team today. Every plan starts with a 14-day free trial —
              no credit card, no lock-in.
            </p>
          </div>

          <div className="mt-12">
            <PricingPlans />
          </div>
        </div>
      </section>

      {/* Feature comparison table */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Compare every feature
            </h2>
            <p className="mt-4 text-base text-gray-600 sm:text-lg">
              A full breakdown of what is included in each plan.
            </p>
          </div>

          {/* Horizontal scroll keeps the table usable on small screens */}
          <div className="mt-12 overflow-x-auto rounded-2xl border border-gray-200">
            <table className="w-full min-w-[640px] border-collapse bg-white text-left">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-6 py-4 text-sm font-semibold text-gray-900">Feature</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                    Starter
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-[#6C3FC4]">
                    Growth
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                    Enterprise
                  </th>
                </tr>
              </thead>
              {COMPARISON_GROUPS.map(({ group, rows }) => (
                <tbody key={group}>
                  <tr className="border-b border-gray-200 bg-gray-50/60">
                    <th
                      colSpan={4}
                      className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                    >
                      {group}
                    </th>
                  </tr>
                  {rows.map((row) => (
                    <tr key={row.feature} className="border-b border-gray-100">
                      <td className="px-6 py-4 text-sm text-gray-700">{row.feature}</td>
                      <td className="px-6 py-4">
                        <ComparisonCell value={row.starter} />
                      </td>
                      <td className="bg-[#6C3FC4]/[0.03] px-6 py-4">
                        <ComparisonCell value={row.growth} />
                      </td>
                      <td className="px-6 py-4">
                        <ComparisonCell value={row.enterprise} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-gray-50 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Frequently asked questions
            </h2>
            <p className="mt-4 text-base text-gray-600 sm:text-lg">
              Still unsure? <Link href="/contact" className="font-semibold text-[#6C3FC4] hover:underline">Talk to our team</Link>.
            </p>
          </div>

          <div className="mt-12">
            <FaqAccordion items={FAQS} />
          </div>
        </div>
      </section>
    </div>
  );
}
