import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Heart, ShieldCheck, Users, Zap } from "lucide-react";

export const metadata: Metadata = {
  title: "About Us — WhatsCRM",
  description:
    "WhatsCRM is built by Corescent Technologies to help Indian businesses turn WhatsApp conversations into customers.",
};

const STATS = [
  { value: "500+", label: "Businesses" },
  { value: "12M+", label: "Messages handled" },
  { value: "31%", label: "Avg. conversion lift" },
  { value: "2021", label: "Founded" },
];

const VALUES = [
  {
    Icon: Zap,
    title: "Ship fast, stay simple",
    description:
      "A tool nobody can figure out is a tool nobody uses. If a feature needs a manual, we have not finished designing it.",
  },
  {
    Icon: ShieldCheck,
    title: "Own the customer's trust",
    description:
      "Your conversations are your business. We isolate every workspace, encrypt data at rest and never train models on your chats.",
  },
  {
    Icon: Heart,
    title: "Support like a teammate",
    description:
      "We answer support tickets ourselves — engineers included. If something is broken, you hear from the person fixing it.",
  },
  {
    Icon: Users,
    title: "Build for the 500th customer",
    description:
      "We say no to features that only help one big client. Everything we ship has to work for the small team too.",
  },
];

const TEAM = [
  {
    name: "Aditya Raghav",
    role: "Co-founder & CEO",
    initials: "AR",
    bio: "Spent eight years building sales software. Started WhatsCRM after watching his family's business lose leads in a WhatsApp group.",
  },
  {
    name: "Kavya Menon",
    role: "Co-founder & CTO",
    initials: "KM",
    bio: "Ex-infrastructure engineer. Designs the real-time messaging layer that keeps thousands of inboxes in sync.",
  },
  {
    name: "Rishi Bansal",
    role: "Head of AI",
    initials: "RB",
    bio: "Works on the lead-qualification and auto-reply models, and on making sure the AI never invents an answer.",
  },
  {
    name: "Neha Kulkarni",
    role: "Head of Customer Success",
    initials: "NK",
    bio: "Onboards every new workspace personally and turns what she hears into next quarter's roadmap.",
  },
];

export default function AboutPage() {
  return (
    <div>
      {/* Hero + mission */}
      <section className="bg-gradient-to-b from-[#6C3FC4]/5 to-white py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
            We are here so no lead is ever lost in a chat
          </h1>
          <p className="mt-6 text-base text-gray-600 sm:text-lg">
            Our mission is simple: give every business — from a two-person shop to a 200-agent sales
            floor — the same power to sell on WhatsApp that the largest companies pay millions for.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-gray-200 bg-gray-50 py-10 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-8 text-center lg:grid-cols-4">
            {STATS.map((stat) => (
              <div key={stat.label}>
                <p className="text-3xl font-extrabold tracking-tight text-[#6C3FC4] sm:text-4xl">
                  {stat.value}
                </p>
                <p className="mt-1 text-sm text-gray-600">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Company story */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Our story</h2>

          <div className="mt-8 space-y-6 text-base leading-relaxed text-gray-600">
            <p>
              WhatsCRM started with a real estate broker in Mumbai — the co-founder&apos;s uncle. He
              was getting forty property enquiries a day on WhatsApp and losing most of them, not
              because he was bad at selling, but because the messages were buried in a group chat
              nobody owned. Enquiries got answered two days late, or twice, or never.
            </p>
            <p>
              We looked for a tool to fix it and found two kinds: enterprise CRMs that cost more
              than his monthly rent and took a quarter to set up, and simple auto-responders that
              could not tell a serious buyer from a window shopper. Nothing in between. So in 2021
              we built the thing in between.
            </p>
            <p>
              Today WhatsCRM runs on the official WhatsApp Business Cloud API and handles millions
              of messages for more than 500 businesses across India — real estate, coaching centres,
              D2C brands, clinics, dealerships. The product has grown a lot since that first version,
              but the goal has not moved: every message gets answered, and every real lead gets
              found.
            </p>
            <p>
              We are a small, remote-first team headquartered in Bengaluru, and we are building this
              for the long run.
            </p>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="bg-gray-50 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              What we believe
            </h2>
            <p className="mt-4 text-base text-gray-600 sm:text-lg">
              Four rules we use to settle almost every argument.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {VALUES.map(({ Icon, title, description }) => (
              <div key={title} className="rounded-2xl border border-gray-200 bg-white p-6">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#6C3FC4]/10">
                  <Icon className="h-6 w-6 text-[#6C3FC4]" />
                </span>
                <h3 className="mt-5 text-lg font-semibold text-gray-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              The team
            </h2>
            <p className="mt-4 text-base text-gray-600 sm:text-lg">
              The people you will actually talk to when you write in.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {TEAM.map(({ name, role, initials, bio }) => (
              <div
                key={name}
                className="rounded-2xl border border-gray-200 bg-white p-6 text-center transition-shadow hover:shadow-lg"
              >
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#6C3FC4]/10 text-lg font-bold text-[#6C3FC4]">
                  {initials}
                </span>
                <h3 className="mt-4 text-base font-semibold text-gray-900">{name}</h3>
                <p className="text-sm font-medium text-[#6C3FC4]">{role}</p>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">{bio}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="pb-16 sm:pb-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-[#6C3FC4] px-6 py-14 text-center sm:px-12 sm:py-16">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Come build your pipeline with us
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-white/80 sm:text-lg">
              Start free for 14 days, or talk to the team first — we are happy either way.
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
                Contact Us
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
