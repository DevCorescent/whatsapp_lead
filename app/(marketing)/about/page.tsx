import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Heart, ShieldCheck, Users, Zap } from "lucide-react";
import { PageCta, PageHero, Section } from "@/components/marketing/PageShell";
import { Reveal, SectionHeading, Stage } from "@/components/marketing/home/primitives";
import { stagger } from "@/components/marketing/home/motion";

export const metadata: Metadata = {
  title: "About Us — WhatsCRM",
  description:
    "WhatsCRM is built by Corescent Technologies to help Indian businesses turn WhatsApp conversations into customers.",
};

/**
 * About Us.
 *
 * THE COPY IS UNCHANGED. Every claim, figure, name and paragraph on this page is the
 * text that was already published — the story, the values, the team, the stats. This
 * pass moved the page onto the site's design system and nothing else, because the
 * words on an About page belong to the company rather than to whoever last touched the
 * stylesheet.
 *
 * WHAT DID CHANGE is the palette. The page was built on `#6C3FC4`, a purple that
 * appears nowhere else on the site: the hero wash, the stat figures, every icon tile,
 * the team initials and the closing panel were all in a brand colour this product does
 * not use. A visitor arriving from the footer used to feel they had left. It now uses
 * the same emerald, the same PageHero and the same PageCta as every other marketing
 * page, so it reads as one site.
 */

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

const STORY = [
  "WhatsCRM started with a real estate broker in Mumbai — the co-founder's uncle. He was getting forty property enquiries a day on WhatsApp and losing most of them, not because he was bad at selling, but because the messages were buried in a group chat nobody owned. Enquiries got answered two days late, or twice, or never.",
  "We looked for a tool to fix it and found two kinds: enterprise CRMs that cost more than his monthly rent and took a quarter to set up, and simple auto-responders that could not tell a serious buyer from a window shopper. Nothing in between. So in 2021 we built the thing in between.",
  "Today WhatsCRM runs on the official WhatsApp Business Cloud API and handles millions of messages for more than 500 businesses across India — real estate, coaching centres, D2C brands, clinics, dealerships. The product has grown a lot since that first version, but the goal has not moved: every message gets answered, and every real lead gets found.",
  "We are a small, remote-first team headquartered in Bengaluru, and we are building this for the long run.",
];

export default function AboutPage() {
  return (
    <div>
      <PageHero
        eyebrow="About us"
        title="We are here so no lead is ever lost in a chat"
        description="Our mission is simple: give every business — from a two-person shop to a 200-agent sales floor — the same power to sell on WhatsApp that the largest companies pay millions for."
        primaryCta={{ label: "Start Free Trial", href: "/register" }}
        secondaryCta={{ label: "See open roles", href: "/careers" }}
      />

      <section className="relative overflow-hidden border-y border-slate-200/70 bg-gradient-to-b from-emerald-50/50 via-white to-white py-10 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Stage className="grid grid-cols-2 gap-8 text-center lg:grid-cols-4">
            {STATS.map((stat, i) => (
              <div key={stat.label} style={stagger(i, 90)} className="wa-pop">
                <p className="nums text-3xl font-extrabold tracking-tight text-emerald-600 sm:text-4xl">
                  {stat.value}
                </p>
                <p className="mt-1 text-sm text-slate-600">{stat.label}</p>
              </div>
            ))}
          </Stage>
        </div>
      </section>

      <Section tone="plain">
        <div className="mx-auto max-w-3xl">
          <SectionHeading eyebrow="Our story" title="How WhatsCRM started" />
          <Stage className="mt-8 space-y-6">
            {STORY.map((paragraph, i) => (
              <p
                key={paragraph.slice(0, 32)}
                style={stagger(i, 70)}
                className="wa-lift text-base leading-relaxed text-slate-600"
              >
                {paragraph}
              </p>
            ))}
          </Stage>
        </div>
      </Section>

      <Section tone="soft" glow>
        <SectionHeading
          align="center"
          eyebrow="What we believe"
          title="Four rules we use to settle almost every argument"
        />

        <Stage className="mt-9 grid gap-4 sm:grid-cols-2">
          {VALUES.map(({ Icon, title, description }, i) => (
            <div
              key={title}
              style={stagger(i, 80)}
              className="wa-lift wa-hover-lift group rounded-2xl bg-white p-6 shadow-sm ring-1 ring-inset ring-slate-900/5 hover:shadow-lg hover:shadow-emerald-900/5 hover:ring-emerald-500/25"
            >
              <span className="wa-icon-tilt flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-600/15 transition-colors duration-300 group-hover:bg-emerald-600 group-hover:ring-emerald-600">
                <Icon className="h-5 w-5 text-emerald-600 transition-colors duration-300 group-hover:text-white" />
              </span>
              <h3 className="mt-5 text-base font-bold tracking-tight text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
            </div>
          ))}
        </Stage>
      </Section>

      <Section tone="plain">
        <SectionHeading
          align="center"
          eyebrow="The team"
          title="The people you will actually talk to when you write in"
        />

        <Stage className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TEAM.map(({ name, role, initials, bio }, i) => (
            <div
              key={name}
              style={stagger(i, 80)}
              className="wa-lift wa-hover-lift group rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-inset ring-slate-900/5 hover:shadow-lg hover:shadow-emerald-900/5 hover:ring-emerald-500/25"
            >
              <span className="wa-icon-tilt mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 text-lg font-bold text-white shadow-md shadow-emerald-600/20">
                {initials}
              </span>
              <h3 className="mt-4 text-base font-semibold text-slate-900">{name}</h3>
              <p className="text-sm font-medium text-emerald-700">{role}</p>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{bio}</p>
            </div>
          ))}
        </Stage>

        <Reveal delay={140}>
          <div className="mt-9 flex justify-center">
            <Link
              href="/careers"
              className="group inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-200 transition hover:-translate-y-0.5 hover:text-slate-900 hover:ring-slate-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              We are hiring — see open roles
              <ArrowRight className="h-4 w-4 text-emerald-600 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </Reveal>
      </Section>

      <PageCta
        title="Come build your pipeline with us"
        description="Start free for 14 days, or talk to the team first — we are happy either way."
        secondary={{ label: "Contact Us", href: "/contact" }}
      />
    </div>
  );
}
