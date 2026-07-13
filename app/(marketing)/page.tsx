import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Bot,
  BookOpen,
  ChartColumn,
  Check,
  MessageSquare,
  Megaphone,
  Plug,
  Rocket,
  Star,
  TrendingUp,
  Upload,
} from "lucide-react";
import { PLANS, formatINR } from "@/components/marketing/plans";

export const metadata: Metadata = {
  title: "WhatsCRM — AI-Powered WhatsApp CRM & Lead Automation",
  description:
    "Automate leads, qualify customers with AI, and close more deals — all inside WhatsApp. Start your free 14-day trial.",
};

const LOGOS = ["Zenith Realty", "EduSpark", "KartNova", "MediCare+", "FinEdge", "AutoDrive"];

const FEATURES = [
  {
    Icon: MessageSquare,
    title: "WhatsApp Inbox",
    description:
      "One shared inbox for your whole team. Assign chats, add internal notes and never lose a customer message again.",
  },
  {
    Icon: Bot,
    title: "AI Auto-Reply",
    description:
      "Llama-powered replies answer common questions instantly, 24×7, in your brand's tone — even while you sleep.",
  },
  {
    Icon: TrendingUp,
    title: "Lead Pipeline",
    description:
      "A drag-and-drop Kanban board from New Lead to Won. AI scores every lead COLD, WARM, HOT or QUALIFIED.",
  },
  {
    Icon: Megaphone,
    title: "Campaigns",
    description:
      "Send bulk WhatsApp campaigns to thousands of contacts with approved templates and live delivery tracking.",
  },
  {
    Icon: ChartColumn,
    title: "Analytics",
    description:
      "Track conversations, response times, conversion rate and won deals on one real-time dashboard.",
  },
  {
    Icon: BookOpen,
    title: "Knowledge Base",
    description:
      "Upload your docs and let the AI answer from your own content, so every reply is accurate and on-brand.",
  },
];

const STEPS = [
  {
    Icon: Plug,
    step: "01",
    title: "Connect WhatsApp",
    description:
      "Link your WhatsApp Business number through the official Meta Cloud API in under five minutes. No code needed.",
  },
  {
    Icon: Upload,
    step: "02",
    title: "Import Contacts",
    description:
      "Bring in your contacts from a CSV or let new conversations create contacts automatically as they arrive.",
  },
  {
    Icon: Rocket,
    step: "03",
    title: "Start Selling",
    description:
      "Let AI qualify and reply while your team focuses on the hot leads that are ready to close.",
  },
];

const TESTIMONIALS = [
  {
    name: "Rohan Mehta",
    company: "Zenith Realty, Mumbai",
    initials: "RM",
    rating: 5,
    quote:
      "We used to lose leads in a WhatsApp group. With WhatsCRM every enquiry lands in one inbox and gets scored automatically. Our site visits went up 40% in two months.",
  },
  {
    name: "Priya Nair",
    company: "EduSpark Academy",
    initials: "PN",
    rating: 5,
    quote:
      "The AI auto-reply answers admission questions at midnight. Our counsellors now walk into work with a list of hot leads instead of 300 unread messages.",
  },
  {
    name: "Arjun Shetty",
    company: "KartNova E-commerce",
    initials: "AS",
    rating: 4,
    quote:
      "Bulk campaigns plus the lead pipeline replaced three separate tools for us. Setup took an afternoon and support actually replies.",
  },
];

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={
            index < rating
              ? "h-4 w-4 fill-amber-400 text-amber-400"
              : "h-4 w-4 fill-gray-200 text-gray-200"
          }
        />
      ))}
    </div>
  );
}

/** Pure-Tailwind mockup of the product inbox — no screenshot asset required. */
function ProductMockup() {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-red-400" />
        <span className="h-3 w-3 rounded-full bg-amber-400" />
        <span className="h-3 w-3 rounded-full bg-green-400" />
        <span className="ml-3 text-xs font-medium text-gray-500">app.whatscrm.in/inbox</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3">
        {/* Conversation list */}
        <div className="border-b border-gray-200 sm:border-b-0 sm:border-r">
          <div className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">
            Inbox
          </div>
          {[
            {
              initials: "RK",
              name: "Rahul Kumar",
              preview: "Is the 2BHK still available?",
              unread: 2,
            },
            {
              initials: "SP",
              name: "Sneha Patel",
              preview: "Please share the price list",
              unread: 0,
            },
            { initials: "AV", name: "Amit Verma", preview: "Can we schedule a demo?", unread: 1 },
          ].map((chat, index) => (
            <div
              key={chat.name}
              className={`flex items-center gap-3 px-4 py-3 ${index === 0 ? "bg-[#6C3FC4]/5" : ""}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#6C3FC4]/10 text-xs font-semibold text-[#6C3FC4]">
                {chat.initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-900">{chat.name}</span>
                <span className="block truncate text-xs text-gray-500">{chat.preview}</span>
              </span>
              {chat.unread > 0 && (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#6C3FC4] text-[10px] font-semibold text-white">
                  {chat.unread}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Chat window */}
        <div className="flex flex-col justify-between bg-gray-50 p-4 sm:col-span-2">
          <div className="space-y-3">
            <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-white px-4 py-2.5 text-sm text-gray-800 shadow-sm">
              Hi, is the 2BHK in Andheri still available?
              <span className="mt-1 block text-[10px] text-gray-400">10:24 AM</span>
            </div>
            <div className="ml-auto max-w-[80%] rounded-2xl rounded-tr-sm bg-[#6C3FC4] px-4 py-2.5 text-sm text-white shadow-sm">
              Yes it is! It&apos;s ₹1.2 Cr, 980 sq ft, sea-facing. Would you like to book a visit
              this weekend?
              <span className="mt-1 block text-[10px] text-white/70">10:24 AM · AI reply</span>
            </div>
            <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-white px-4 py-2.5 text-sm text-gray-800 shadow-sm">
              Sunday works. Please share the location.
              <span className="mt-1 block text-[10px] text-gray-400">10:26 AM</span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-2 rounded-full bg-green-100 px-3 py-1">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-xs font-semibold text-green-700">
                Lead score: 86 · QUALIFIED
              </span>
            </span>
            <span className="hidden rounded-full bg-[#6C3FC4]/10 px-3 py-1 text-xs font-semibold text-[#6C3FC4] sm:block">
              Stage: Proposal Sent
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div>
      {/* 1. Hero */}
      <section className="bg-gradient-to-b from-[#6C3FC4]/5 to-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#6C3FC4]/20 bg-[#6C3FC4]/10 px-4 py-1.5 text-xs font-semibold text-[#6C3FC4] sm:text-sm">
              <Bot className="h-4 w-4" />
              Powered by Llama 3.3 — AI that sells for you
            </span>

            <h1 className="mt-6 text-4xl font-extrabold leading-tight tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
              Turn WhatsApp chats into{" "}
              <span className="text-[#6C3FC4]">customers on autopilot</span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-base text-gray-600 sm:text-lg lg:text-xl">
              WhatsCRM is the AI-powered WhatsApp CRM that captures every lead, qualifies them
              automatically and helps your team close more deals — all from one shared inbox.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <Link
                href="/register"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#6C3FC4] px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-[#6C3FC4]/20 transition-colors hover:bg-[#5A32A6] sm:w-auto"
              >
                Start Free Trial
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="/contact"
                className="inline-flex w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-6 py-3.5 text-base font-semibold text-gray-700 transition-colors hover:bg-gray-50 sm:w-auto"
              >
                Book a Demo
              </Link>
            </div>

            <p className="mt-5 text-sm text-gray-500">
              14-day free trial · No credit card required · Cancel anytime
            </p>
          </div>

          <div className="mx-auto mt-14 max-w-5xl sm:mt-16">
            <ProductMockup />
          </div>
        </div>
      </section>

      {/* 2. Logos strip */}
      <section className="border-y border-gray-200 bg-gray-50 py-10 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm font-semibold uppercase tracking-wide text-gray-500">
            Trusted by 500+ businesses across India
          </p>
          <div className="mt-8 grid grid-cols-2 items-center justify-items-center gap-6 sm:grid-cols-3 lg:grid-cols-6">
            {LOGOS.map((logo) => (
              <span
                key={logo}
                className="text-base font-bold tracking-tight text-gray-400 sm:text-lg"
              >
                {logo}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Features grid */}
      <section className="py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Everything you need to sell on WhatsApp
            </h2>
            <p className="mt-4 text-base text-gray-600 sm:text-lg">
              Six modules that replace your shared inbox, your spreadsheet and your follow-up
              reminders.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ Icon, title, description }) => (
              <div
                key={title}
                className="rounded-2xl border border-gray-200 bg-white p-6 transition-shadow hover:shadow-lg"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#6C3FC4]/10">
                  <Icon className="h-6 w-6 text-[#6C3FC4]" />
                </span>
                <h3 className="mt-5 text-lg font-semibold text-gray-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{description}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Link
              href="/features"
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#6C3FC4] transition-colors hover:text-[#5A32A6]"
            >
              Explore all features
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* 4. How it works */}
      <section className="bg-gray-50 py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Live in three steps
            </h2>
            <p className="mt-4 text-base text-gray-600 sm:text-lg">
              Most teams are up and running the same afternoon they sign up.
            </p>
          </div>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {STEPS.map(({ Icon, step, title, description }) => (
              <div key={step} className="relative rounded-2xl border border-gray-200 bg-white p-8">
                <span className="absolute right-6 top-6 text-4xl font-extrabold text-[#6C3FC4]/10">
                  {step}
                </span>
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#6C3FC4] text-white">
                  <Icon className="h-7 w-7" />
                </span>
                <h3 className="mt-6 text-xl font-semibold text-gray-900">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Testimonials */}
      <section className="py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Loved by sales teams
            </h2>
            <p className="mt-4 text-base text-gray-600 sm:text-lg">
              Here is what our customers say after switching to WhatsCRM.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {TESTIMONIALS.map(({ name, company, initials, rating, quote }) => (
              <figure
                key={name}
                className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <StarRating rating={rating} />
                <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-gray-700">
                  &ldquo;{quote}&rdquo;
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-3 border-t border-gray-100 pt-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#6C3FC4]/10 text-sm font-semibold text-[#6C3FC4]">
                    {initials}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-gray-900">{name}</span>
                    <span className="block text-xs text-gray-500">{company}</span>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* 6. Pricing preview */}
      <section className="bg-gray-50 py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-base text-gray-600 sm:text-lg">
              Start free for 14 days. Upgrade, downgrade or cancel whenever you want.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className={
                  plan.isPopular
                    ? "relative rounded-2xl border-2 border-[#6C3FC4] bg-white p-8 shadow-xl"
                    : "relative rounded-2xl border border-gray-200 bg-white p-8"
                }
              >
                {plan.isPopular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#6C3FC4] px-3 py-1 text-xs font-semibold text-white">
                    Most Popular
                  </span>
                )}

                <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                <p className="mt-2 text-sm text-gray-600">{plan.tagline}</p>

                <p className="mt-6 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold tracking-tight text-gray-900">
                    {formatINR(plan.monthlyPrice)}
                  </span>
                  <span className="text-sm font-medium text-gray-500">/month</span>
                </p>

                <ul className="mt-6 space-y-3">
                  {plan.features.slice(0, 4).map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#6C3FC4]" />
                      <span className="text-sm text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/pricing"
                  className={
                    plan.isPopular
                      ? "mt-8 block rounded-lg bg-[#6C3FC4] px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-[#5A32A6]"
                      : "mt-8 block rounded-lg border border-gray-300 px-4 py-3 text-center text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                  }
                >
                  View plan details
                </Link>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#6C3FC4] transition-colors hover:text-[#5A32A6]"
            >
              Compare all plans and features
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* 7. Final CTA banner */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-[#6C3FC4] px-6 py-14 text-center sm:px-12 sm:py-16">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Start your free 14-day trial
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-white/80 sm:text-lg">
              Join 500+ businesses turning WhatsApp conversations into revenue. No credit card, no
              setup fee, no lock-in.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <Link
                href="/register"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-6 py-3.5 text-base font-semibold text-[#6C3FC4] shadow-lg transition-colors hover:bg-gray-100 sm:w-auto"
              >
                Start Free Trial
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="/contact"
                className="inline-flex w-full items-center justify-center rounded-lg border border-white/40 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-white/10 sm:w-auto"
              >
                Talk to Sales
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
