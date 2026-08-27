"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, CheckCheck, FileText, Sparkles, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import { PhoneFrame } from "@/components/marketing/PhoneFrame";
import { useInView } from "@/components/marketing/home/primitives";
import { useReducedMotion } from "@/components/marketing/home/interactive";
import type { IndustryChat } from "@/components/marketing/industries";

/**
 * The industry page's proof: this sector's own conversation, being answered.
 *
 * A LIGHTER SIBLING OF THE HOMEPAGE HERO, on purpose. The hero pairs its phone with a
 * rail of system events, because it is the first thing anyone sees and it has to make
 * the whole argument on its own. This one keeps everything inside the handset: by the
 * time a visitor is on /industries/real-estate they have already been sold the
 * mechanism, and what they want to see is their own vocabulary in the bubbles. Six
 * beats, then it holds and replays.
 *
 * It shares PhoneFrame with the hero, so both pages show the same device — but the
 * framing differs and should: the hero is the customer's view of a business account,
 * this is the business's own inbox, so the header carries the customer's name.
 *
 * Everything sector-specific arrives as `chat` data, so all eight pages share this one
 * component and none of them share a sentence.
 */

const SCHEDULE = [250, 950, 1900, 2500, 3300, 4100];
const LAST_BEAT = 6;
const HOLD_MS = 8600;

export function IndustryChatDemo({ chat }: { chat: IndustryChat }) {
  const reduced = useReducedMotion();
  const { ref, shown } = useInView<HTMLDivElement>();
  const [played, setPlayed] = useState(0);
  const [run, setRun] = useState(0);

  const beat = reduced ? LAST_BEAT : played;

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
    <div ref={ref} className="relative mx-auto flex w-full justify-center">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-8 rounded-[3rem] bg-[radial-gradient(closest-side,rgba(16,185,129,0.16),transparent_100%)]"
      />

      <div className="wa-reveal-scale relative" data-shown={shown}>
        <PhoneFrame
          contact={chat.contact}
          initials={chat.initials}
          status="online"
          headerBadge={
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ring-1 ring-inset transition-colors duration-500",
                beat >= 6
                  ? "bg-slate-100 text-slate-500 ring-slate-900/10"
                  : "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
              )}
            >
              <Sparkles className="h-2.5 w-2.5" />
              {beat >= 6 ? "Handed over" : "AI on"}
            </span>
          }
        >
          {/* Fills the screen between the header and the composer. PhoneFrame carries
              the handset's minimum height, so six beats of content arriving never
              reflow the copy sitting beside it. */}
          <div className="flex flex-1 flex-col justify-end space-y-2 px-2.5 pb-3 pt-2.5">
            {beat >= 1 && (
              <div className="wa-swap max-w-[86%] rounded-2xl rounded-tl-md bg-white px-2.5 py-1.5 shadow-sm ring-1 ring-inset ring-slate-900/5">
                <p className="text-[11.5px] leading-snug text-slate-700">{chat.incoming}</p>
                <p className="mt-0.5 text-right text-[8.5px] text-slate-400">10:14</p>
              </div>
            )}

            {beat === 2 && (
              <div className="wa-swap flex justify-end">
                <div className="flex items-center gap-1.5 rounded-2xl rounded-tr-md bg-emerald-100/80 px-2.5 py-2 ring-1 ring-inset ring-emerald-600/10">
                  <span className="flex items-center gap-1">
                    {[0, 1, 2].map((dot) => (
                      <span
                        key={dot}
                        style={{ animationDelay: `${dot * 160}ms` }}
                        className="wa-typing-dot h-1.5 w-1.5 rounded-full bg-emerald-600"
                      />
                    ))}
                  </span>
                  <span className="text-[10px] text-emerald-700">AI is typing…</span>
                </div>
              </div>
            )}

            {beat >= 3 && (
              <div className="wa-swap flex justify-end">
                <div className="max-w-[88%] rounded-2xl rounded-tr-md bg-emerald-100/80 px-2.5 py-1.5 ring-1 ring-inset ring-emerald-600/10">
                  <p className="mb-0.5 flex items-center gap-1">
                    <Sparkles className="h-2.5 w-2.5 text-emerald-700" />
                    <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-700">
                      AI reply
                    </span>
                  </p>
                  <p className="text-[11.5px] leading-snug text-slate-800">{chat.reply}</p>
                  <p className="mt-0.5 flex items-center justify-end gap-1 text-[8.5px] text-slate-500">
                    10:14 <CheckCheck className="h-2.5 w-2.5 text-sky-500" />
                  </p>
                </div>
              </div>
            )}

            {beat >= 4 && (
              <div className="wa-swap flex justify-end">
                <span className="inline-flex max-w-full items-center gap-1 rounded-lg bg-white px-2 py-1 ring-1 ring-inset ring-emerald-600/20">
                  <FileText className="h-3 w-3 shrink-0 text-emerald-600" />
                  <span className="truncate text-[9px] font-medium text-emerald-700">
                    Source: {chat.source}
                  </span>
                </span>
              </div>
            )}

            {beat >= 5 && (
              <div className="wa-swap rounded-xl bg-white/90 p-2 shadow-sm ring-1 ring-inset ring-slate-900/5">
                <p className="flex items-center gap-1.5">
                  <BadgeCheck className="h-3 w-3 text-emerald-600" />
                  <span className="text-[9px] font-bold uppercase tracking-wide text-slate-600">
                    Captured from the chat
                  </span>
                </p>
                <dl className="mt-1.5 flex flex-wrap gap-1.5">
                  {chat.captured.map((field, i) => (
                    <div
                      key={field.label}
                      style={{ animationDelay: `${i * 120}ms` }}
                      className="wa-swap inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] ring-1 ring-inset ring-emerald-600/20"
                    >
                      <dt className="font-medium text-emerald-700">{field.label}</dt>
                      <dd className="text-emerald-900">{field.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {beat >= 6 && (
              <div className="wa-swap flex items-center gap-1.5 rounded-xl bg-slate-900 px-2 py-1.5">
                <Workflow className="h-3 w-3 shrink-0 text-emerald-400" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[9px] font-medium uppercase tracking-wide text-slate-400">
                    CRM updated
                  </span>
                  <span className="block truncate text-[11px] font-semibold text-white">
                    {chat.stage}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[9.5px] font-medium text-emerald-200">
                  {chat.owner}
                </span>
              </div>
            )}
          </div>
        </PhoneFrame>
      </div>
    </div>
  );
}
