import type { Metadata } from "next";
import {
  ArrowRight,
  Baby,
  Briefcase,
  Clock,
  GraduationCap,
  HeartPulse,
  Laptop,
  MapPin,
  Plane,
  Rocket,
  Users,
  type LucideIcon,
} from "lucide-react";
import { PageCta, PageHero, Section } from "@/components/marketing/PageShell";
import { Reveal, SectionHeading, Stage } from "@/components/marketing/home/primitives";
import { stagger } from "@/components/marketing/home/motion";

export const metadata: Metadata = {
  title: "Career — WhatsCRM",
  description:
    "Build the WhatsApp CRM Indian businesses run on. Open roles in engineering, design, sales and support at Corescent Technologies, Bengaluru and remote.",
};

/**
 * Careers.
 *
 * WHAT A CANDIDATE ACTUALLY WANTS, in order: is there a job I can do, what would I be
 * doing, what is it like here, and how do I apply. This page is in that order, and the
 * open roles come before the culture section for exactly that reason — a values grid
 * above the job list is a page written for the company rather than the applicant.
 *
 * EVERY ROLE APPLIES BY EMAIL, to a mailto with the role pre-filled in the subject.
 * There is no applicant-tracking system in this repository, and a form that posts
 * nowhere is worse than an email address: the candidate cannot tell that it failed.
 *
 * The hiring process is spelled out with the number of stages and how long it takes,
 * because that is the single most common thing candidates write in to ask.
 */

const ROLES = [
  {
    title: "Senior Full-Stack Engineer",
    team: "Engineering",
    type: "Full-time",
    location: "Bengaluru / Remote",
    blurb:
      "Next.js, TypeScript, Prisma and Postgres. You would own whole surfaces — the shared inbox, the flow builder — from schema to pixel.",
  },
  {
    title: "AI / ML Engineer",
    team: "Engineering",
    type: "Full-time",
    location: "Bengaluru",
    blurb:
      "Retrieval over customer documents, lead scoring and conversation understanding. Getting an answer right matters more here than getting it fast.",
  },
  {
    title: "Product Designer",
    team: "Design",
    type: "Full-time",
    location: "Remote (India)",
    blurb:
      "Design for people answering customers between other jobs. Every extra click you remove is an hour someone gets back this month.",
  },
  {
    title: "Customer Success Manager",
    team: "Customer Success",
    type: "Full-time",
    location: "Bengaluru",
    blurb:
      "Onboard new workspaces, get their first automation live, and tell engineering what keeps going wrong. The loop only closes if you are honest about the second part.",
  },
  {
    title: "Inside Sales Executive",
    team: "Sales",
    type: "Full-time",
    location: "Bengaluru",
    blurb:
      "Talk to businesses drowning in WhatsApp enquiries and show them a way out. You will use the product all day, which is the fastest way to learn it.",
  },
  {
    title: "Support Engineer",
    team: "Support",
    type: "Full-time",
    location: "Remote (India)",
    blurb:
      "Debug webhook deliveries, template rejections and Meta Cloud API errors. Half the job is explaining Meta's rules clearly to someone who has never read them.",
  },
];

const BENEFITS: { Icon: LucideIcon; title: string; body: string }[] = [
  {
    Icon: Laptop,
    title: "Remote-friendly",
    body: "Most roles are remote within India. The Bengaluru office is there when you want it, not a condition of the job.",
  },
  {
    Icon: HeartPulse,
    title: "Health cover",
    body: "Insurance for you, your partner and your children, from your first day rather than after probation.",
  },
  {
    Icon: GraduationCap,
    title: "Learning budget",
    body: "An annual budget for courses, books and conferences, and the working hours to actually use it.",
  },
  {
    Icon: Plane,
    title: "Real leave",
    body: "Generous paid leave, and a team that covers for you properly so you are not answering messages on it.",
  },
  {
    Icon: Baby,
    title: "Parental leave",
    body: "Paid leave for every new parent, and a phased return that does not pretend nothing has changed.",
  },
  {
    Icon: Rocket,
    title: "Ownership from day one",
    body: "Small team, real surfaces. You will ship something customers use in your first fortnight.",
  },
];

const PROCESS = [
  {
    step: "Apply",
    body: "Email us with your CV or a link to your work. One paragraph on why this role is plenty.",
  },
  {
    step: "Intro call",
    body: "Thirty minutes with the hiring manager, about what you have built and what you want next.",
  },
  {
    step: "Craft round",
    body: "A practical exercise close to the real job, timeboxed, with no unpaid production work.",
  },
  {
    step: "Team conversation",
    body: "Meet the people you would work with, and ask us the things you would rather not ask a recruiter.",
  },
  {
    step: "Offer",
    body: "A decision within a week of the last conversation, and a written answer either way.",
  },
];

const CULTURE: { Icon: LucideIcon; title: string; body: string }[] = [
  {
    Icon: Users,
    title: "Small team, wide scope",
    body: "Nobody here has one narrow lane. The trade-off is that you will have to learn things outside your title.",
  },
  {
    Icon: Clock,
    title: "Async by default",
    body: "Written decisions, few meetings. If it can be a document, it is a document.",
  },
  {
    Icon: Briefcase,
    title: "Customers in the room",
    body: "Engineers sit in on support calls. It is uncomfortable and it is the fastest feedback loop we have.",
  },
];

const CAREERS_EMAIL = "careers@whatscrm.in";

export default function CareersPage() {
  return (
    <div>
      <PageHero
        eyebrow="Career"
        title="Build the WhatsApp CRM Indian businesses run on"
        description="We are a small team at Corescent Technologies making software that answers customers when the shop is shut. If that sounds like work worth doing, there is probably a role for you below."
        primaryCta={{ label: "See open roles", href: "#open-roles" }}
        secondaryCta={{ label: "About us", href: "/about" }}
      />

      <Section id="open-roles" tone="soft" glow>
        <SectionHeading
          align="center"
          eyebrow="Open roles"
          title="Six roles, hiring now"
          description="Do not match every line of a description? Apply anyway and tell us which parts you would grow into."
        />

        <Stage className="mt-8 space-y-3">
          {ROLES.map((role, i) => (
            <div
              key={role.title}
              style={stagger(i, 60)}
              className="wa-lift wa-hover-lift group rounded-2xl bg-white p-5 shadow-sm ring-1 ring-inset ring-slate-900/5 hover:shadow-lg hover:shadow-emerald-900/5 hover:ring-emerald-500/25 sm:p-6"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold tracking-tight text-slate-900">
                      {role.title}
                    </h3>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/15">
                      {role.team}
                    </span>
                  </div>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                    {role.blurb}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                      {role.location}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                      {role.type}
                    </span>
                  </div>
                </div>

                <a
                  href={`mailto:${CAREERS_EMAIL}?subject=${encodeURIComponent(`Application: ${role.title}`)}`}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                >
                  Apply
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                </a>
              </div>
            </div>
          ))}
        </Stage>
      </Section>

      <Section tone="plain">
        <SectionHeading
          align="center"
          eyebrow="Benefits"
          title="What we offer, in plain terms"
        />
        <Stage className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((benefit, i) => (
            <div
              key={benefit.title}
              style={stagger(i, 60)}
              className="wa-lift wa-hover-lift group h-full rounded-2xl bg-white p-5 shadow-sm ring-1 ring-inset ring-slate-900/5 hover:shadow-lg hover:shadow-emerald-900/5 hover:ring-emerald-500/25"
            >
              <span className="wa-icon-tilt flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-600/15 transition-colors duration-300 group-hover:bg-emerald-600 group-hover:ring-emerald-600">
                <benefit.Icon className="h-4 w-4 text-emerald-600 transition-colors duration-300 group-hover:text-white" />
              </span>
              <h3 className="mt-4 text-sm font-bold tracking-tight text-slate-900">
                {benefit.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{benefit.body}</p>
            </div>
          ))}
        </Stage>
      </Section>

      <Section tone="wash">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <SectionHeading
              eyebrow="How we work"
              title="Three things that are true here"
              description="Worth knowing before you apply, because they are not for everyone."
            />
            <Stage className="mt-7 space-y-3">
              {CULTURE.map((item, i) => (
                <div
                  key={item.title}
                  style={stagger(i, 80)}
                  className="wa-lift group flex items-start gap-3 rounded-2xl bg-white/80 p-4 shadow-sm ring-1 ring-inset ring-slate-900/5 backdrop-blur transition duration-300 hover:-translate-y-1 hover:shadow-md hover:ring-emerald-500/25"
                >
                  <span className="wa-icon-tilt flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-600/15 transition-colors duration-300 group-hover:bg-emerald-600 group-hover:ring-emerald-600">
                    <item.Icon className="h-4 w-4 text-emerald-600 transition-colors duration-300 group-hover:text-white" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold tracking-tight text-slate-900">
                      {item.title}
                    </h3>
                    <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{item.body}</p>
                  </div>
                </div>
              ))}
            </Stage>
          </div>

          <div>
            <SectionHeading
              eyebrow="Hiring process"
              title="Five stages, about two weeks"
              description="No surprise rounds, and no unpaid production work at any point."
            />
            {/* The rail is drawn once behind the list rather than as a border on each
                item, so the last step does not trail a line into nothing. */}
            <Stage className="relative mt-7 pl-8">
              <span
                aria-hidden
                className="wa-rail absolute bottom-6 left-[0.9375rem] top-2 w-px bg-gradient-to-b from-emerald-400 to-emerald-200"
              />
              <ol className="space-y-5">
                {PROCESS.map((stage, i) => (
                  <li key={stage.step} className="relative">
                    <span
                      style={stagger(i, 120)}
                      className="nums wa-pop absolute -left-8 top-0 flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-bold text-emerald-700 shadow-sm ring-1 ring-inset ring-emerald-600/20"
                    >
                      {i + 1}
                    </span>
                    <div style={stagger(i, 120, 60)} className="wa-lift">
                      <h3 className="text-sm font-semibold tracking-tight text-slate-900">
                        {stage.step}
                      </h3>
                      <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{stage.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Stage>
          </div>
        </div>

        <Reveal delay={140}>
          <div className="mt-10 rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-inset ring-slate-900/5">
            <h3 className="text-base font-bold tracking-tight text-slate-900">
              Nothing above fits?
            </h3>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
              Tell us what you would want to build here. We read every message, and we have
              opened roles off the back of one before.
            </p>
            <a
              href={`mailto:${CAREERS_EMAIL}?subject=${encodeURIComponent("Open application")}`}
              className="group mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-emerald-600/25 transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              {CAREERS_EMAIL}
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </a>
          </div>
        </Reveal>
      </Section>

      <PageCta
        title="Want to see what you would be working on?"
        description="The product is free to try. Spend ten minutes inside it before your first conversation with us."
        primary={{ label: "Try WhatsCRM", href: "/register" }}
        secondary={{ label: "Read about the team", href: "/about" }}
      />
    </div>
  );
}
