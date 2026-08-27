"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  CheckCheck,
  CircleCheck,
  FileText,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PhoneFrame } from "@/components/marketing/PhoneFrame";
import { useInView } from "./primitives";
import { useReducedMotion } from "./interactive";

/**
 * The hero's product demo: a WhatsApp business thread being answered by Waboxa, and
 * the system events that answer it.
 *
 * It is the argument of the whole page in ten seconds — a customer asks, the AI
 * understands, the AI replies with a document, the lead is qualified, the CRM is
 * updated — and it is the reason the hero needs no explanatory paragraph.
 *
 * TWO HALVES, ONE CLOCK
 *
 *  • The phone (see PhoneFrame) plays the conversation a customer would actually see.
 *    Four things land in it and no more: the question, a typing state, the reply, the
 *    price list. Everything the *system* does happens outside the frame, because a
 *    real WhatsApp thread does not contain status cards, and the moment you put them
 *    in one it stops looking like a phone.
 *
 *  • The event rail beside it is the system, as a feed. AI Processing → Auto Reply
 *    Sent → Lead Qualified → CRM Updated, each arriving on its own beat, threaded on
 *    a dashed spine that fills in behind them. That split is the whole idea: the
 *    phone is what the customer experiences, the rail is what the business gets.
 *
 * WHY IT JUST LOOPS. An earlier version paused on a tap and explained each part in a
 * caption under the frame. The caption is redundant now — every event card carries its
 * own one-line explanation — and dropping it took a block of reserved space out of the
 * tallest column on the page. So the scene plays, holds, and replays. Nothing repeats
 * inside a beat except the typing dots, and only while the AI is thinking.
 *
 * Everything is HTML and CSS. There is no screenshot here, so it stays sharp at any
 * density and the states are real states rather than a picture of one.
 */

/** ms after the scene appears at which each beat lands. */
const SCHEDULE = [400, 1300, 2400, 3300, 4300, 5300];
const LAST_BEAT = 6;
/** How long the finished scene holds before it replays. */
const HOLD_MS = 9600;

type SystemEvent = {
  id: string;
  /** Beat at which this event has fired. */
  at: number;
  Icon: LucideIcon;
  title: string;
  body: string;
  /** The latency stamp, where there is one worth showing. */
  meta?: string;
  /** The last card earns a real destination rather than a decorative button. */
  href?: string;
  cta?: string;
};

const EVENTS: SystemEvent[] = [
  {
    id: "processing",
    at: 2,
    Icon: Bot,
    title: "AI Processing",
    body: "Understanding customer intent",
    meta: "1.2s",
  },
  {
    id: "reply",
    at: 3,
    Icon: Zap,
    title: "Auto Reply Sent",
    body: "Instant response delivered",
    meta: "1.5s",
  },
  {
    id: "qualified",
    at: 5,
    Icon: BadgeCheck,
    title: "Lead Qualified",
    body: "Budget & requirement identified",
    meta: "2.3s",
  },
  {
    id: "crm",
    at: 6,
    Icon: CircleCheck,
    title: "CRM Updated",
    body: "New lead added to WhatsCRM",
    href: "/features#lead-pipeline",
    cta: "View in CRM",
  },
];

export function HeroShowcase() {
  const reduced = useReducedMotion();
  const { ref, shown } = useInView<HTMLDivElement>();

  const [played, setPlayed] = useState(0);
  const [run, setRun] = useState(0);

  // Reduced motion gets the finished scene immediately: the content is the message,
  // and it has to be readable even when the animation is unwelcome.
  const beat = reduced ? LAST_BEAT : played;
  const at = (n: number) => beat >= n;

  useEffect(() => {
    if (!shown || reduced) return;

    const timers = SCHEDULE.map((delay, i) => window.setTimeout(() => setPlayed(i + 1), delay));
    const loop = window.setTimeout(() => {
      setPlayed(0);
      setRun((value) => value + 1);
    }, HOLD_MS);

    return () => {
      timers.forEach(window.clearTimeout);
      window.clearTimeout(loop);
    };
  }, [shown, run, reduced]);

  return (
    <div ref={ref} className="relative">
      {/* Ambient glow, so the composition reads as lifted off the page. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-6 -top-6 bottom-0 rounded-[3rem] bg-[radial-gradient(closest-side,rgba(16,185,129,0.16),transparent_100%)]"
      />

      {/* Phone first, rail second. On a phone-sized screen they stack and the rail
          becomes a 2×2 grid under the device; from `sm` they sit side by side and the
          rail is a vertical feed. One DOM, two layouts — no duplicated markup. */}
      <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-4 lg:gap-5">
        <div className="wa-reveal-scale" data-shown={shown}>
          <PhoneFrame
            contact="Waboxa"
            initials="W"
            status="Business Account"
            verified
            headerBadge={
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                <span className="relative flex h-1 w-1">
                  <span className="wa-pulse-ring absolute inline-flex h-full w-full rounded-full bg-emerald-400" />
                  <span className="relative inline-flex h-1 w-1 rounded-full bg-emerald-600" />
                </span>
                AI
              </span>
            }
          >
            {/* Bottom-anchored, because that is where a conversation lives. Filling from
                the top left a slab of empty wallpaper under the last message and made
                the screen read as a panel with some text in it rather than as a chat. */}
            <div className="flex flex-1 flex-col justify-end space-y-2 px-2.5 pb-3 pt-2.5">
              {/* Day divider — a realism cue that costs one element. */}
              <p className="flex justify-center">
                <span className="rounded-md bg-white/80 px-2 py-0.5 text-[9px] font-medium text-slate-500 shadow-sm">
                  Today
                </span>
              </p>

              {at(1) && (
                <div className="wa-swap max-w-[85%] rounded-2xl rounded-tl-md bg-white px-2.5 py-1.5 shadow-sm ring-1 ring-inset ring-slate-900/5">
                  <p className="text-[11.5px] leading-snug text-slate-700">
                    Hi, I need pricing for 500 units.
                  </p>
                  <p className="mt-0.5 text-right text-[8.5px] text-slate-400">9:41 AM</p>
                </div>
              )}

              {beat === 2 && (
                <div className="wa-swap flex justify-end">
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-tr-md bg-emerald-100/80 px-2.5 py-2 ring-1 ring-inset ring-emerald-600/10">
                    {[0, 1, 2].map((dot) => (
                      <span
                        key={dot}
                        style={{ animationDelay: `${dot * 160}ms` }}
                        className="wa-typing-dot h-1.5 w-1.5 rounded-full bg-emerald-600"
                      />
                    ))}
                  </div>
                </div>
              )}

              {at(3) && (
                <div className="wa-swap flex justify-end">
                  <div className="max-w-[88%] rounded-2xl rounded-tr-md bg-emerald-100/80 px-2.5 py-1.5 ring-1 ring-inset ring-emerald-600/10">
                    <p className="mb-0.5 flex items-center gap-1">
                      <Sparkles className="h-2.5 w-2.5 text-emerald-700" />
                      <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-700">
                        Waboxa AI
                      </span>
                    </p>
                    <p className="text-[11.5px] leading-snug text-slate-800">
                      Sure! I can help with that. Here&apos;s our pricing information.
                    </p>
                    <p className="mt-0.5 flex items-center justify-end gap-1 text-[8.5px] text-slate-500">
                      9:41 AM <CheckCheck className="h-2.5 w-2.5 text-sky-500" />
                    </p>
                  </div>
                </div>
              )}

              {at(4) && (
                <div className="wa-swap flex justify-end">
                  <div className="max-w-[88%] rounded-2xl rounded-tr-md bg-emerald-100/80 p-1.5 ring-1 ring-inset ring-emerald-600/10">
                    <div className="flex items-center gap-2 rounded-xl bg-white/90 px-2 py-1.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-rose-50 ring-1 ring-inset ring-rose-500/15">
                        <FileText className="h-3 w-3 text-rose-500" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[10px] font-semibold text-slate-800">
                          Waboxa-Pricing-Guide.pdf
                        </span>
                        <span className="block text-[8.5px] text-slate-500">1.2 MB · PDF</span>
                      </span>
                    </div>
                    <p className="mt-0.5 flex items-center justify-end gap-1 pr-1 text-[8.5px] text-slate-500">
                      9:41 AM <CheckCheck className="h-2.5 w-2.5 text-sky-500" />
                    </p>
                  </div>
                </div>
              )}
            </div>
          </PhoneFrame>
        </div>

        {/* ── The event feed ──────────────────────────────────────────────── */}
        <ul className="relative grid w-full max-w-[19rem] grid-cols-2 gap-2 sm:flex sm:w-[11.5rem] sm:max-w-none sm:shrink-0 sm:flex-col sm:gap-2.5 sm:pl-4 lg:w-[12.5rem]">
          {/* The spine. A dashed rule the events thread onto, drawn only where there
              is a single column for it to follow. */}
          <span
            aria-hidden
            className="absolute inset-y-5 left-[0.32rem] hidden w-px border-l border-dashed border-emerald-400/50 sm:block"
          />

          {EVENTS.map((event, i) => {
            const fired = at(event.at);
            const latest = fired && !at(EVENTS[i + 1]?.at ?? LAST_BEAT + 1);

            return (
              <li key={event.id} className="relative min-w-0">
                {/* The node on the spine. Pulses while its event is the newest. */}
                <span
                  aria-hidden
                  className={cn(
                    "absolute -left-[0.93rem] top-[1.15rem] hidden h-2 w-2 rounded-full ring-2 ring-white transition-colors duration-500 sm:block",
                    fired ? "bg-emerald-500" : "bg-slate-300",
                  )}
                >
                  {latest && (
                    <span className="wa-pulse-ring absolute inset-0 inline-flex rounded-full bg-emerald-400" />
                  )}
                </span>

                <div
                  className={cn(
                    "h-full rounded-2xl border bg-white/95 p-2.5 backdrop-blur-sm transition-all duration-500 sm:p-3",
                    fired
                      ? "border-emerald-500/25 opacity-100 shadow-lg shadow-emerald-900/[0.07]"
                      : "border-slate-900/5 opacity-45 shadow-sm",
                    latest && "border-emerald-500/50 shadow-emerald-600/15",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-xl transition-all duration-500",
                        fired
                          ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/30"
                          : "bg-slate-100 text-slate-300",
                      )}
                    >
                      <event.Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11.5px] font-bold leading-tight tracking-tight text-slate-900">
                        {event.title}
                      </span>
                      {/* The one-line explanation is the first thing to go on a narrow
                          screen: four cards of body copy under a phone is a wall. */}
                      <span className="mt-0.5 hidden text-[10px] leading-snug text-slate-500 sm:block">
                        {event.body}
                      </span>
                    </span>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    {event.meta ? (
                      <span
                        className={cn(
                          "nums inline-flex items-center gap-1 text-[9.5px] font-semibold transition-colors duration-500",
                          fired ? "text-emerald-700" : "text-slate-300",
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            fired ? "bg-emerald-500" : "bg-slate-300",
                          )}
                        />
                        {event.meta}
                      </span>
                    ) : (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-[9.5px] font-semibold transition-colors duration-500",
                          fired ? "text-emerald-700" : "text-slate-300",
                        )}
                      >
                        <CircleCheck className="h-2.5 w-2.5" />
                        Done
                      </span>
                    )}

                    {event.href && event.cta && (
                      <Link
                        href={event.href}
                        tabIndex={fired ? undefined : -1}
                        className={cn(
                          // Hidden on the 2×2 grid: wrapped to two lines there and made
                          // one of the four cards taller than the rest for no gain.
                          "group/cta hidden items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[9.5px] font-semibold transition-all duration-500 sm:inline-flex",
                          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
                          fired
                            ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 hover:bg-emerald-100"
                            : "pointer-events-none text-slate-300",
                        )}
                      >
                        {event.cta}
                        <ArrowRight className="h-2.5 w-2.5 transition-transform duration-200 group-hover/cta:translate-x-0.5" />
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
