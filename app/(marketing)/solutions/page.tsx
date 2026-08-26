import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  Clock,
  Megaphone,
  Target,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import { PageCta, PageHero, Section } from "@/components/marketing/PageShell";
import {
  Reveal,
  SectionHeading,
  Stage,
} from "@/components/marketing/home/primitives";
import { stagger } from "@/components/marketing/home/motion";

export const metadata: Metadata = {
  title: "Solutions — WhatsCRM",
  description:
    "Six things teams come to WhatsCRM to fix: slow first replies, unqualified leads, lost conversations, one-off outreach, support that does not scale, and no idea what is working.",
};

/**
 * Solutions — organised by the problem, not by the feature.
 *
 * DELIBERATELY NOT /industries. That page answers "do you work with businesses like
 * mine"; this one answers "does this fix the thing that is broken for me". A visitor
 * usually knows one of those two questions and not the other, so merging them would
 * force everyone to read twice as much to find their half. The nav keeps them apart
 * for the same reason.
 *
 * EACH ENTRY LEADS WITH THE SYMPTOM, in the words someone would use about their own
 * inbox, and only then names the mechanism. A page of feature names is a page that
 * assumes the reader has already decided.
 *
 * The `id` on each card is the deep-link target the navbar's Solutions dropdown uses.
 */

type Solution = {
  id: string;
  Icon: LucideIcon;
  symptom: string;
  title: string;
  body: string;
  points: string[];
  href: string;
};

const SOLUTIONS: Solution[] = [
  {
    id: "reply-instantly",
    Icon: Bot,
    symptom: "“We reply hours later.”",
    title: "Reply instantly, at any hour",
    body: "The AI answers from your own documents — price lists, brochures, policies — and cites the file it took the answer from, so nobody has to trust it blindly. Anything it cannot answer is handed to a human with the thread intact.",
    points: [
      "Answers grounded in your uploaded documents",
      "Every reply shows its source",
      "Clean hand-off to an agent when confidence is low",
    ],
    href: "/features#ai-auto-reply",
  },
  {
    id: "qualify-every-lead",
    Icon: Target,
    symptom: "“Every chat looks the same.”",
    title: "Qualify every lead automatically",
    body: "WhatsCRM reads the conversation for budget, authority, need and timeline, scores the lead 0–100 and files it in the pipeline. Your team opens the app to a sorted list instead of a wall of unread chats.",
    points: [
      "BANT extracted from the conversation itself",
      "A 0–100 score, recalculated as the thread grows",
      "Pipeline stage set without anyone updating a field",
    ],
    href: "/features#lead-pipeline",
  },
  {
    id: "never-lose-a-lead",
    Icon: Clock,
    symptom: "“It got lost in the group chat.”",
    title: "Never lose a conversation again",
    body: "One number, one inbox, and an owner on every thread. Assignment, internal notes and a full history mean a handover costs one click rather than a scroll through someone else's phone.",
    points: [
      "Assign a conversation to an agent or a team",
      "Internal notes the customer never sees",
      "Full history on every contact, forever",
    ],
    href: "/features#shared-inbox",
  },
  {
    id: "scale-outreach",
    Icon: Megaphone,
    symptom: "“We message people one by one.”",
    title: "Reach a segment, not a spreadsheet",
    body: "Build a segment from the data the CRM already holds, send an approved template to it, and watch delivery, reads and replies per recipient. Replies land back in the same shared inbox.",
    points: [
      "Segments from lead score, stage, tag or industry",
      "Meta-approved templates with variables",
      "Per-recipient delivery, read and reply tracking",
    ],
    href: "/features#campaigns",
  },
  {
    id: "support-at-scale",
    Icon: Ticket,
    symptom: "“Support and sales share one inbox.”",
    title: "Run support without a second tool",
    body: "Any conversation becomes a ticket with a priority and an SLA clock, routed to the right team. Sales threads stay in the pipeline; support threads stay on the board. Same inbox, two lanes.",
    points: [
      "Convert a chat to a ticket in one click",
      "Priorities, SLA timers and assignment rules",
      "Resolution history against the contact record",
    ],
    href: "/features#shared-inbox",
  },
  {
    id: "know-what-works",
    Icon: BarChart3,
    symptom: "“We have no idea what is working.”",
    title: "See what your conversations produce",
    body: "Response times, qualified leads, conversion by stage and campaign performance, in one place. The numbers come from the conversations themselves, so nobody has to maintain a tracker.",
    points: [
      "First-response and resolution times",
      "Leads, deals and conversion by stage",
      "Campaign performance next to pipeline movement",
    ],
    href: "/features#analytics",
  },
];

export default function SolutionsPage() {
  return (
    <div>
      <PageHero
        eyebrow="Solutions"
        title="Start from what is broken, not from a feature list"
        description="Six problems teams bring to us, and exactly what WhatsCRM does about each one. Every mechanism below is shipped and running in the product today."
        primaryCta={{ label: "Start Free Trial", href: "/register" }}
        secondaryCta={{ label: "See how it works", href: "/#how-it-works" }}
      />

      <Section tone="soft" glow>
        <Stage className="grid gap-4 lg:grid-cols-2">
          {SOLUTIONS.map((solution, i) => (
            <article
              key={solution.id}
              id={solution.id}
              style={stagger(i, 70)}
              className="wa-lift wa-hover-lift group scroll-mt-24 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-inset ring-slate-900/5 hover:shadow-lg hover:shadow-emerald-900/5 hover:ring-emerald-500/25"
            >
              <div className="flex items-start gap-3">
                <span className="wa-icon-tilt flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-600/15 transition-colors duration-300 group-hover:bg-emerald-600 group-hover:ring-emerald-600">
                  <solution.Icon className="h-5 w-5 text-emerald-600 transition-colors duration-300 group-hover:text-white" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium italic text-slate-500">{solution.symptom}</p>
                  <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-900">
                    {solution.title}
                  </h2>
                </div>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-slate-600">{solution.body}</p>

              <ul className="mt-4 space-y-2">
                {solution.points.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-sm text-slate-600">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    {point}
                  </li>
                ))}
              </ul>

              <Link
                href={solution.href}
                className="group/link mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 transition hover:text-emerald-800"
              >
                See the feature
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover/link:translate-x-0.5" />
              </Link>
            </article>
          ))}
        </Stage>
      </Section>

      <Section tone="plain">
        <SectionHeading
          align="center"
          eyebrow="Or start from your market"
          title="Six industries, six different ways of selling"
          description="If your question is “do you work with businesses like mine”, the industry pages answer it directly."
        />
        <Reveal delay={120}>
          <div className="mt-7 flex justify-center">
            <Link
              href="/industries"
              className="group inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:-translate-y-0.5 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              Browse by industry
              <ArrowRight className="h-4 w-4 text-emerald-400 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </Reveal>
      </Section>

      <PageCta
        title="Which of these is costing you the most?"
        description="Connect your WhatsApp number and fix it this week. Free trial, no card required."
        secondary={{ label: "Talk to us", href: "/contact" }}
      />
    </div>
  );
}
