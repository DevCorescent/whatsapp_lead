"use client";

import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Check,
  CheckCheck,
  FileText,
  Gauge,
  RotateCcw,
  Sparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { cn, SCORE_STYLE } from "@/lib/utils";
import { CountUp, useInView } from "./primitives";
import { useReducedMotion } from "./interactive";

/**
 * The hero's product demo: a WhatsApp thread being processed by WhatsCRM, playing.
 *
 * It is the argument of the whole page in fifteen seconds — message, thinking, a
 * grounded reply, qualification, a score, a CRM move — and it is the reason the hero
 * needs no paragraph. Everything is HTML and CSS: there is no screenshot here, so it
 * stays sharp at any density and the states are real states rather than a picture of
 * one.
 *
 * TWO MODES, ONE SCENE
 *
 *  • Playing. Beats are scheduled from a single effect and land in order, then the
 *    scene holds and restarts. Nothing loops on its own inside a beat — the only
 *    repeating motion is the typing indicator, and only while the AI is "thinking".
 *
 *  • Explored. The first tap anywhere jumps to the finished scene and pauses it, so a
 *    visitor who wants to look never has to chase a moving target. Tapping a part of
 *    the thread — or one of the floating cards — selects it and explains it in the
 *    caption under the frame. The caption is *under* the frame, in reserved space,
 *    rather than a popover over it: it can never be clipped by the section below and
 *    it needs no dismissing on a touch screen.
 */

type StepId = "message" | "reply" | "source" | "qualified" | "score" | "crm";

/** Beat at which each part of the scene has arrived. */
const AT: Record<StepId, number> = {
  message: 1,
  reply: 3,
  source: 4,
  qualified: 5,
  score: 6,
  crm: 7,
};

const LAST_BEAT = 7;

/** ms after the scene appears at which each beat lands. */
const SCHEDULE = [300, 1100, 2200, 2900, 3800, 4700, 5600];
/** How long the finished scene holds before it replays. */
const HOLD_MS = 9800;

const DETAIL: Record<StepId, string> = {
  message: "A new WhatsApp message. The contact and conversation are created automatically.",
  reply: "Written from your own knowledge base and sent in seconds — no agent involved.",
  source: "The document the answer came from, recorded on the message itself.",
  qualified: "Budget, need and timeline, each judged from what the customer actually wrote.",
  score: "0–100, written onto the lead record and sorted into a band your team can filter on.",
  crm: "The lead moves to the stage you defined and is assigned to an agent, with the full history.",
};

const FLOATERS: { id: StepId; icon: LucideIcon; label: string; value: string }[] = [
  { id: "reply", icon: Sparkles, label: "AI auto reply", value: "in 4 seconds" },
  { id: "qualified", icon: Check, label: "Lead qualified", value: "3 / 3 criteria" },
  { id: "score", icon: Gauge, label: "Score", value: "85 · QUALIFIED" },
  { id: "crm", icon: Workflow, label: "CRM updated", value: "Stage → Qualified" },
];

export function HeroShowcase() {
  const reduced = useReducedMotion();
  const { ref, shown } = useInView<HTMLDivElement>();

  const [played, setPlayed] = useState(0);
  const [run, setRun] = useState(0);
  const [paused, setPaused] = useState(false);
  const [focus, setFocus] = useState<StepId | null>(null);

  const beat = reduced || paused ? LAST_BEAT : played;
  const at = (step: StepId) => beat >= AT[step];

  useEffect(() => {
    if (!shown || reduced || paused) return;

    const timers = SCHEDULE.map((delay, i) => window.setTimeout(() => setPlayed(i + 1), delay));
    const loop = window.setTimeout(() => {
      setPlayed(0);
      setRun((value) => value + 1);
    }, HOLD_MS);

    return () => {
      timers.forEach(window.clearTimeout);
      window.clearTimeout(loop);
    };
  }, [shown, run, reduced, paused]);

  /** Any tap freezes the finished scene and selects what was tapped. */
  const select = (step: StepId) => {
    setPaused(true);
    setFocus((current) => (current === step ? null : step));
  };

  const replay = () => {
    setFocus(null);
    setPaused(false);
    setPlayed(0);
    setRun((value) => value + 1);
  };

  /** Shared treatment for anything in the scene that can be tapped. */
  const tappable = (step: StepId) =>
    cn(
      "wa-tap block w-full text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
      focus === step && "ring-2 ring-emerald-500 ring-offset-2 ring-offset-white",
    );

  return (
    <div ref={ref} className="relative">
      {/* Ambient glow, so the composition reads as lifted off the page. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-8 rounded-[3rem] bg-[radial-gradient(closest-side,rgba(16,185,129,0.16),transparent_100%)]"
      />

      <div className="relative mx-auto w-full max-w-[22rem] sm:max-w-[23rem]">
        {/* ── The thread ─────────────────────────────────────────────────── */}
        <div className="wa-reveal-scale relative rounded-[1.6rem] bg-white p-3 shadow-2xl shadow-emerald-950/10 ring-1 ring-inset ring-slate-900/5" data-shown={shown}>
          <div className="flex items-center gap-2.5 border-b border-slate-100 px-1.5 pb-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-xs font-semibold text-white">
              RM
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-900">Rohit Mehta</p>
              <p className="truncate text-[10px] text-emerald-600">online</p>
            </div>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset transition-colors duration-500",
                at("crm")
                  ? "bg-slate-100 text-slate-500 ring-slate-900/10"
                  : "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
              )}
            >
              <Sparkles className="h-2.5 w-2.5" />
              {at("crm") ? "Handed over" : "AI on"}
            </span>
          </div>

          {/* Fixed height: seven beats of content arriving must not resize the frame
              or the page would reflow under the headline beside it. The generous
              bottom padding is clearance for the score card that hangs off this
              corner — without it the card lands on the qualification chips. */}
          <div className="min-h-[15.5rem] space-y-2 px-1.5 pb-8 pt-3">
            {at("message") && (
              <button type="button" onClick={() => select("message")} className={cn(tappable("message"), "wa-swap rounded-2xl")}>
                <span className="block max-w-[85%] rounded-2xl rounded-tl-sm bg-slate-50 px-3.5 py-2.5 ring-1 ring-inset ring-slate-900/5">
                  <span className="block text-xs leading-relaxed text-slate-700">
                    Hi, do you handle bulk orders? We need around 500 units.
                  </span>
                  <span className="mt-1 block text-[10px] text-slate-400">10:02</span>
                </span>
              </button>
            )}

            {beat === 2 && (
              <div className="wa-swap flex justify-end">
                <div className="flex items-center gap-2 rounded-2xl rounded-tr-sm bg-emerald-50 px-3.5 py-2.5 ring-1 ring-inset ring-emerald-600/15">
                  <span className="flex items-center gap-1">
                    {[0, 1, 2].map((dot) => (
                      <span
                        key={dot}
                        style={{ animationDelay: `${dot * 160}ms` }}
                        className="wa-typing-dot h-1.5 w-1.5 rounded-full bg-emerald-500"
                      />
                    ))}
                  </span>
                  <span className="text-[11px] text-emerald-700">AI is typing…</span>
                </div>
              </div>
            )}

            {at("reply") && (
              <div className="wa-swap flex justify-end">
                <button
                  type="button"
                  onClick={() => select("reply")}
                  className={cn(tappable("reply"), "max-w-[88%] rounded-2xl")}
                >
                  <span className="block rounded-2xl rounded-tr-sm bg-emerald-50 px-3.5 py-2.5 ring-1 ring-inset ring-emerald-600/15">
                    <span className="mb-1 flex items-center gap-1.5">
                      <Sparkles className="h-3 w-3 text-emerald-600" />
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                        AI reply
                      </span>
                    </span>
                    <span className="block text-xs leading-relaxed text-slate-700">
                      Yes — we can handle 500 units. Bulk orders ship in 8–10 working days.
                    </span>
                    <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-400">
                      10:02 <CheckCheck className="h-3 w-3 text-sky-500" />
                    </span>
                  </span>
                </button>
              </div>
            )}

            {at("source") && (
              <div className="wa-swap flex justify-end">
                <button
                  type="button"
                  onClick={() => select("source")}
                  className={cn(tappable("source"), "w-auto rounded-lg")}
                >
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-inset ring-emerald-600/20">
                    <FileText className="h-3 w-3 shrink-0 text-emerald-600" />
                    <span className="truncate text-[10px] font-medium text-emerald-700">
                      Source: Pricing-and-EMI-Policy.pdf
                    </span>
                  </span>
                </button>
              </div>
            )}

            {at("qualified") && (
              <button
                type="button"
                onClick={() => select("qualified")}
                className={cn(tappable("qualified"), "wa-swap rounded-xl")}
              >
                <span className="block rounded-xl bg-slate-50 p-2.5 ring-1 ring-inset ring-slate-900/5">
                  <span className="flex items-center gap-1.5">
                    <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                      Lead qualified
                    </span>
                  </span>
                  <span className="mt-1.5 flex flex-wrap gap-1.5">
                    {["Budget", "Need", "Timeline"].map((criterion, i) => (
                      <span
                        key={criterion}
                        style={{ animationDelay: `${i * 120}ms` }}
                        className="wa-swap inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20"
                      >
                        <Check className="h-2.5 w-2.5" />
                        {criterion}
                      </span>
                    ))}
                  </span>
                </span>
              </button>
            )}
          </div>
        </div>

        {/* ── Score, floating off the lower-left ─────────────────────────── */}
        {at("score") && (
          <button
            type="button"
            onClick={() => select("score")}
            className={cn(
              "wa-swap absolute -bottom-7 -left-3 flex items-center gap-2.5 rounded-2xl bg-slate-900 px-3 py-2.5 text-left shadow-xl shadow-slate-900/25 transition duration-300 hover:-translate-y-1 hover:shadow-2xl sm:-left-12",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500",
              focus === "score" && "ring-2 ring-emerald-400 ring-offset-2 ring-offset-white",
            )}
          >
            <Gauge className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>
              <span className="block text-[9px] font-medium uppercase tracking-wide text-slate-400">
                Lead score
              </span>
              <span className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold leading-none tracking-tight text-white">
                  <CountUp from={0} to={85} />
                </span>
                <span className="text-[10px] text-slate-500">/ 100</span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[9px] font-semibold ring-1 ring-inset",
                    SCORE_STYLE.QUALIFIED,
                  )}
                >
                  QUALIFIED
                </span>
              </span>
            </span>
          </button>
        )}

        {/* ── CRM update, floating off the upper-right ───────────────────── */}
        {at("crm") && (
          <button
            type="button"
            onClick={() => select("crm")}
            className={cn(
              "wa-swap absolute -right-3 -top-6 w-[9.5rem] rounded-2xl bg-white p-3 text-left shadow-xl shadow-slate-900/10 ring-1 ring-inset ring-slate-900/5 transition duration-300 hover:-translate-y-1 hover:shadow-2xl sm:-right-10",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
              focus === "crm" && "ring-2 ring-emerald-500 ring-offset-2 ring-offset-white",
            )}
          >
            <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
              <Workflow className="h-3 w-3 text-emerald-600" />
              CRM updated
            </span>
            <span className="mt-1.5 flex items-center gap-1.5 text-[11px]">
              <span className="text-slate-400 line-through">New Lead</span>
              <span className="text-emerald-600">→</span>
              <span className="font-semibold text-emerald-800">Qualified</span>
            </span>
            <span className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
              <span className="relative flex h-1.5 w-1.5">
                <span className="wa-pulse-ring absolute inline-flex h-full w-full rounded-full bg-emerald-400" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600" />
              </span>
              Assigned to Priya S.
            </span>
          </button>
        )}
      </div>

      {/* ── The floating status cards, as a row under the frame on small screens ── */}
      <ul className="mt-14 flex flex-wrap justify-center gap-1.5 sm:mt-12">
        {FLOATERS.map((floater) => {
          const arrived = at(floater.id);
          return (
            <li key={floater.id}>
              <button
                type="button"
                onClick={() => arrived && select(floater.id)}
                disabled={!arrived}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-medium ring-1 ring-inset transition-all duration-300",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
                  arrived
                    ? "bg-white text-slate-700 shadow-sm ring-slate-900/10 hover:-translate-y-0.5 hover:shadow-md hover:ring-emerald-500/30"
                    : "bg-white/40 text-slate-300 ring-slate-900/5",
                  focus === floater.id && "bg-emerald-50 text-emerald-800 ring-emerald-500",
                )}
              >
                <floater.icon
                  className={cn("h-3 w-3", arrived ? "text-emerald-600" : "text-slate-300")}
                />
                {floater.label}
                {arrived && <span className="text-slate-400">·</span>}
                {arrived && <span className="text-slate-500">{floater.value}</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {/* ── Caption. Reserved space under the frame, so an explanation can never be
             clipped by the section below and never has to be dismissed. ───────── */}
      <div className="mt-3 flex min-h-[3.25rem] items-start justify-center gap-2 px-2">
        {focus ? (
          <p key={focus} className="wa-swap max-w-sm text-center text-[12px] leading-relaxed text-slate-600">
            {DETAIL[focus]}
          </p>
        ) : (
          <p className="text-center text-[12px] text-slate-400">
            {paused ? "Tap any part of the run to see what it does." : "Watch it run — or tap any part of it."}
          </p>
        )}
      </div>

      {paused && (
        <div className="mt-1 flex justify-center">
          <button
            type="button"
            onClick={replay}
            className="wa-tap inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm ring-1 ring-inset ring-slate-900/10 transition hover:-translate-y-0.5 hover:text-slate-900 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            <RotateCcw className="h-3 w-3 text-emerald-600" />
            Play again
          </button>
        </div>
      )}
    </div>
  );
}
