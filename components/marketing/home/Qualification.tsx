"use client";

import { ArrowRight, Check, Quote, Sparkles } from "lucide-react";
import { cn, DEFAULT_PIPELINE_STAGES, SCORE_STYLE } from "@/lib/utils";
import { Container, CountUp, Reveal, SectionHeading } from "./primitives";
import { stagger } from "./motion";

/**
 * BANT, shown as an interface rather than described as a concept.
 *
 * Each criterion carries the sentence from the conversation that satisfied it, because
 * that is what makes a score arguable — a number on its own is something a sales lead
 * has to take on faith, and the first one they disagree with kills the feature.
 *
 * Score bands and pipeline stages come from lib/utils so the marketing page and the
 * product cannot describe them differently.
 */

const CRITERIA = [
  {
    label: "Budget",
    quote: "I can approve the budget today, we've allocated about ₹1.7L.",
    met: true,
  },
  {
    label: "Authority",
    quote: "I handle purchasing for both our Pune outlets.",
    met: true,
  },
  {
    label: "Need",
    quote: "We need around 500 units for the new store opening.",
    met: true,
  },
  {
    label: "Timeline",
    quote: "It has to be delivered before 20 March.",
    met: true,
  },
];

export function Qualification() {
  const stages = DEFAULT_PIPELINE_STAGES.filter((stage) => stage.outcome === "OPEN");

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-white to-emerald-50/30 py-20 sm:py-28">
      <Container>
        <SectionHeading
          align="center"
          eyebrow="Lead qualification"
          title="Stop guessing which leads are serious"
          description="The AI reads the whole thread and judges it against budget, authority, need and timeline — then writes the result onto the lead, where your team already works."
        />

        <div className="mx-auto mt-14 grid max-w-5xl gap-4 lg:grid-cols-5">
          {/* BANT panel */}
          <Reveal className="lg:col-span-3">
            <div className="h-full rounded-2xl bg-white p-6 shadow-sm ring-1 ring-inset ring-slate-900/5 sm:p-7">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  BANT qualification
                </p>
              </div>

              <ul className="mt-6 space-y-3.5">
                {CRITERIA.map((item, i) => (
                  <li
                    key={item.label}
                    className="flex gap-3.5 rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-900/5"
                  >
                    <span
                      className="wa-pop mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100"
                      style={stagger(i, 160, 120)}
                    >
                      <Check className="h-3 w-3 text-emerald-700" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                      <p className="mt-1 flex gap-1.5 text-xs italic leading-relaxed text-slate-600">
                        <Quote className="mt-0.5 h-3 w-3 shrink-0 text-slate-300" />
                        {item.quote}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              <p className="mt-5 text-xs leading-relaxed text-slate-500">
                Every criterion is judged from what the customer actually wrote, so the score always
                has a reason attached to it.
              </p>
            </div>
          </Reveal>

          {/* Score + pipeline */}
          <div className="flex flex-col gap-4 lg:col-span-2">
            <Reveal delay={120}>
              <div className="rounded-2xl bg-slate-900 p-6 shadow-xl shadow-slate-900/10">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Lead score
                </p>
                <div className="mt-3 flex items-end gap-3">
                  <p className="text-5xl font-bold leading-none tracking-tight text-white">
                    <CountUp from={40} to={85} />
                  </p>
                  <span
                    style={{ transitionDelay: "900ms" }}
                    className={cn(
                      "wa-pop mb-1.5 rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ring-inset",
                      SCORE_STYLE.QUALIFIED,
                    )}
                  >
                    QUALIFIED
                  </span>
                </div>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    style={{ transitionDelay: "420ms" }}
                    className="wa-grow-x h-full w-[85%] rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                  />
                </div>

                <div className="nums mt-3 flex justify-between text-[10px] text-slate-500">
                  <span>Cold 0</span>
                  <span>Warm 31</span>
                  <span>Hot 61</span>
                  <span>Qualified 81</span>
                </div>
              </div>
            </Reveal>

            <Reveal delay={200}>
              <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-inset ring-slate-900/5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Enters your pipeline
                </p>
                <ul className="mt-4 space-y-1.5">
                  {stages.map((stage, i) => {
                    const isTarget = stage.name === "Qualified";
                    return (
                      <li
                        key={stage.name}
                        style={stagger(i, 120, 260)}
                        className={cn(
                          "wa-lift flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs transition",
                          isTarget
                            ? "bg-emerald-50 font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-600/20"
                            : "text-slate-500",
                        )}
                      >
                        <span>{stage.name}</span>
                        {isTarget && <ArrowRight className="h-3.5 w-3.5" />}
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
                  These are the default stages. Rename, recolour, reorder or add your own — the
                  pipeline is yours, not a fixed list.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </Container>
    </section>
  );
}
