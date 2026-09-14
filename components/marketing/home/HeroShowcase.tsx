"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CheckCheck, CircleCheck, FileText, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { PhoneFrame } from "@/components/marketing/PhoneFrame";
import { useInView } from "./primitives";
import { useReducedMotion } from "./interactive";
import { CmsIcon } from "./cmsIcon";
import { CmsLink } from "./CmsLink";

/**
 * The hero's product demo: a WhatsApp business thread being answered, and the
 * system events that answer it. All text comes from the CMS hero section.
 *
 * TWO HALVES, ONE CLOCK
 *
 *  • The phone plays what the customer sees: their question, a typing state, the
 *    AI reply, the document. Nothing the *system* does goes inside the frame — a
 *    real chat has no status cards in it.
 *  • The rail beside it is the system as a feed — AI processing → auto reply →
 *    lead qualified → CRM updated — each arriving on its own beat.
 *
 * The scene plays, holds, and replays. Reduced motion gets the finished scene.
 */

export interface HeroChat {
  contactName: string;
  contactStatus: string;
  customerMessage: string;
  aiLabel: string;
  aiReply: string;
  attachmentName: string;
  attachmentMeta: string;
  time: string;
  eventCtaLabel: string;
  eventCtaHref: string;
}

export interface HeroEvent {
  id: string;
  icon: string;
  title: string;
  body: string;
  meta: string;
}

/** ms after the scene appears at which beats 1…6 land. */
const SCHEDULE = [400, 1300, 2400, 3300, 4300, 5300];
/**
 * The beat each event fires on. The first two land with the typing state and the
 * reply; the rest wait for the document, so qualification visibly follows the answer.
 */
const EVENT_BEATS = [2, 3, 5, 6];
/** How long the finished scene holds before it replays. */
const HOLD_MS = 9600;

export function HeroShowcase({ chat, events }: { chat: HeroChat; events: HeroEvent[] }) {
  const reduced = useReducedMotion();
  const { ref, shown } = useInView<HTMLDivElement>();

  const rail = events.slice(0, EVENT_BEATS.length);
  const lastBeat = Math.max(4, rail.length > 0 ? EVENT_BEATS[rail.length - 1] : 0);

  const [played, setPlayed] = useState(0);
  const [run, setRun] = useState(0);

  const beat = reduced ? lastBeat : played;
  const at = (n: number) => beat >= n;

  useEffect(() => {
    if (!shown || reduced) return;

    const timers = SCHEDULE.slice(0, lastBeat).map((delay, i) =>
      window.setTimeout(() => setPlayed(i + 1), delay),
    );
    const loop = window.setTimeout(() => {
      setPlayed(0);
      setRun((value) => value + 1);
    }, HOLD_MS);

    return () => {
      timers.forEach(window.clearTimeout);
      window.clearTimeout(loop);
    };
  }, [shown, run, reduced, lastBeat]);

  const initials = chat.contactName.trim().charAt(0).toUpperCase() || "W";

  return (
    <div ref={ref} className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-6 -top-6 bottom-0 rounded-[3rem] bg-[radial-gradient(closest-side,rgba(16,185,129,0.16),transparent_100%)]"
      />

      {/* Phone first, rail second: stacked with a 2×2 rail on phones, side by side from `sm`. */}
      <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-4 lg:gap-5">
        <div className="wa-reveal-scale" data-shown={shown}>
          <PhoneFrame
            contact={chat.contactName}
            initials={initials}
            status={chat.contactStatus || undefined}
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
            <div className="flex flex-1 flex-col justify-end space-y-2 px-2.5 pb-3 pt-2.5">
              <p className="flex justify-center">
                <span className="rounded-md bg-white/80 px-2 py-0.5 text-[9px] font-medium text-slate-500 shadow-sm">
                  Today
                </span>
              </p>

              {at(1) && (
                <div className="wa-swap max-w-[85%] rounded-2xl rounded-tl-md bg-white px-2.5 py-1.5 shadow-sm ring-1 ring-inset ring-slate-900/5">
                  <p className="break-words text-[11.5px] leading-snug text-slate-700">{chat.customerMessage}</p>
                  {chat.time && <p className="mt-0.5 text-right text-[8.5px] text-slate-400">{chat.time}</p>}
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
                    {chat.aiLabel && (
                      <p className="mb-0.5 flex items-center gap-1">
                        <Sparkles className="h-2.5 w-2.5 text-emerald-700" />
                        <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-700">
                          {chat.aiLabel}
                        </span>
                      </p>
                    )}
                    <p className="break-words text-[11.5px] leading-snug text-slate-800">{chat.aiReply}</p>
                    <p className="mt-0.5 flex items-center justify-end gap-1 text-[8.5px] text-slate-500">
                      {chat.time} <CheckCheck className="h-2.5 w-2.5 text-sky-500" />
                    </p>
                  </div>
                </div>
              )}

              {at(4) && chat.attachmentName && (
                <div className="wa-swap flex justify-end">
                  <div className="max-w-[88%] rounded-2xl rounded-tr-md bg-emerald-100/80 p-1.5 ring-1 ring-inset ring-emerald-600/10">
                    <div className="flex items-center gap-2 rounded-xl bg-white/90 px-2 py-1.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-rose-50 ring-1 ring-inset ring-rose-500/15">
                        <FileText className="h-3 w-3 text-rose-500" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[10px] font-semibold text-slate-800">
                          {chat.attachmentName}
                        </span>
                        {chat.attachmentMeta && (
                          <span className="block text-[8.5px] text-slate-500">{chat.attachmentMeta}</span>
                        )}
                      </span>
                    </div>
                    <p className="mt-0.5 flex items-center justify-end gap-1 pr-1 text-[8.5px] text-slate-500">
                      {chat.time} <CheckCheck className="h-2.5 w-2.5 text-sky-500" />
                    </p>
                  </div>
                </div>
              )}
            </div>
          </PhoneFrame>
        </div>

        {rail.length > 0 && (
          <ul className="relative grid w-full max-w-[19rem] grid-cols-2 gap-2 sm:flex sm:w-[11.5rem] sm:max-w-none sm:shrink-0 sm:flex-col sm:gap-2.5 sm:pl-4 lg:w-[12.5rem]">
            <span
              aria-hidden
              className="absolute inset-y-5 left-[0.32rem] hidden w-px border-l border-dashed border-emerald-400/50 sm:block"
            />

            {rail.map((event, i) => {
              const fired = at(EVENT_BEATS[i]);
              const latest = fired && !at(EVENT_BEATS[i + 1] ?? lastBeat + 1);
              const isLast = i === rail.length - 1;
              const cta = isLast && chat.eventCtaLabel && chat.eventCtaHref;

              return (
                <li key={event.id} className="relative min-w-0">
                  <span
                    aria-hidden
                    className={cn(
                      "absolute -left-[0.93rem] top-[1.15rem] hidden h-2 w-2 rounded-full ring-2 ring-white transition-colors duration-500 sm:block",
                      fired ? "bg-emerald-500" : "bg-slate-300",
                    )}
                  >
                    {latest && <span className="wa-pulse-ring absolute inset-0 inline-flex rounded-full bg-emerald-400" />}
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
                          fired ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/30" : "bg-slate-100 text-slate-300",
                        )}
                      >
                        <CmsIcon name={event.icon} className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11.5px] font-bold leading-tight tracking-tight text-slate-900">
                          {event.title}
                        </span>
                        {event.body && (
                          <span className="mt-0.5 hidden text-[10px] leading-snug text-slate-500 sm:block">
                            {event.body}
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "nums inline-flex items-center gap-1 text-[9.5px] font-semibold transition-colors duration-500",
                          fired ? "text-emerald-700" : "text-slate-300",
                        )}
                      >
                        {event.meta ? (
                          <>
                            <span className={cn("h-1.5 w-1.5 rounded-full", fired ? "bg-emerald-500" : "bg-slate-300")} />
                            {event.meta}
                          </>
                        ) : (
                          <>
                            <CircleCheck className="h-2.5 w-2.5" />
                            Done
                          </>
                        )}
                      </span>

                      {cta && (
                        <CmsLink
                          href={chat.eventCtaHref}
                          tabIndex={fired ? undefined : -1}
                          className={cn(
                            "group/cta hidden items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[9.5px] font-semibold transition-all duration-500 sm:inline-flex",
                            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
                            fired
                              ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 hover:bg-emerald-100"
                              : "pointer-events-none text-slate-300",
                          )}
                        >
                          {chat.eventCtaLabel}
                          <ArrowRight className="h-2.5 w-2.5 transition-transform duration-200 group-hover/cta:translate-x-0.5" />
                        </CmsLink>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
