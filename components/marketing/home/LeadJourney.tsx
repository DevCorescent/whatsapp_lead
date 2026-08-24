"use client";

import {
  ArrowRight,
  Brain,
  Gauge,
  MessageSquarePlus,
  Target,
  UserCheck,
  Workflow,
} from "lucide-react";
import { Container, Reveal, SectionHeading, useInView } from "./primitives";

/**
 * The narrative spine of the page: what actually happens between a customer texting
 * and a deal existing.
 *
 * Aceternity's Tracing Beam, reduced to what it is — a rail that fills as the section
 * enters the viewport. The original tracks scroll position frame by frame against a
 * motion value; at six fixed steps the difference is imperceptible and the scroll
 * listener is not, so this fills once on entry instead.
 *
 * Each step corresponds to a real stage of lib/inbound.ts → /api/ai/qualify →
 * the pipeline. The order is the order the code runs in.
 */

const STEPS = [
  {
    icon: MessageSquarePlus,
    title: "A new WhatsApp message arrives",
    body: "The webhook verifies Meta's signature and creates the contact and conversation automatically. Nothing is typed by hand, and a redelivered message never lands twice.",
    chip: "Contact created",
  },
  {
    icon: Brain,
    title: "AI understands what they want",
    body: "The thread is read in context and answered from your own knowledge base — with the document it drew on recorded on the message itself.",
    chip: "Answered in seconds",
  },
  {
    icon: Target,
    title: "The lead is qualified",
    body: "BANT runs across the whole transcript: budget, authority, need and timeline, each judged from what the customer actually said.",
    chip: "BANT complete",
  },
  {
    icon: Gauge,
    title: "The lead receives a score",
    body: "A score from 0 to 100 lands on the lead and sorts it into COLD, WARM, HOT or QUALIFIED — written to the record, not just displayed.",
    chip: "Score 85 · QUALIFIED",
  },
  {
    icon: Workflow,
    title: "The lead enters your pipeline",
    body: "It moves into a stage you defined. Rename, recolour, reorder or add stages freely — the pipeline is your data, not a fixed list.",
    chip: "Stage: Qualified",
  },
  {
    icon: UserCheck,
    title: "Your team follows up and converts",
    body: "The thread is assigned to an agent with the full history, the score and the qualification notes already attached. No re-reading, no guessing.",
    chip: "Assigned to Priya S.",
  },
];

export function LeadJourney() {
  const { ref, shown } = useInView<HTMLDivElement>("-20% 0px -20% 0px");

  return (
    <section
      id="lead-journey"
      className="relative scroll-mt-20 overflow-hidden bg-gradient-to-b from-emerald-50/50 via-white to-white py-20 sm:py-28"
    >
      <Container>
        <SectionHeading
          align="center"
          eyebrow="The lead journey"
          title="From first message to qualified opportunity"
          description="Six steps that run on their own. Your team joins at the point where a human actually changes the outcome."
        />

        {/* One observer drives the whole journey. `data-shown` here is what the rail and
            every step node key off, so the beam and the nodes it passes are timed against
            the same moment rather than against six independent observers. */}
        <div
          ref={ref}
          data-shown={shown}
          className="relative mx-auto mt-16 max-w-3xl"
        >
          {/* The beam. Absolutely positioned behind the rows and scaled from the top,
              so it reads as drawing downward through the steps. */}
          <div
            aria-hidden
            className="absolute left-[1.4375rem] top-2 hidden w-px bg-slate-200 sm:block"
            style={{ height: "calc(100% - 3rem)" }}
          >
            <div className="wa-rail h-full w-full bg-gradient-to-b from-emerald-500 via-emerald-400 to-teal-300" />
          </div>

          <ol className="space-y-8 sm:space-y-10">
            {STEPS.map((step, i) => (
              <li key={step.title} className="relative">
                <Reveal delay={i * 90} className="flex gap-4 sm:gap-6">
                  <div className="relative z-10 shrink-0">
                    <span
                      style={{ transitionDelay: "90ms" }}
                      className="wa-pop flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-inset ring-emerald-500/25"
                    >
                      <step.icon className="h-5 w-5 text-emerald-600" />
                    </span>
                    <span
                      style={{ transitionDelay: "190ms" }}
                      className="wa-pop nums absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-semibold text-white"
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1 pb-1">
                    <h3 className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
                      {step.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{step.body}</p>
                    <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                      <ArrowRight className="h-3 w-3" />
                      {step.chip}
                    </span>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}
