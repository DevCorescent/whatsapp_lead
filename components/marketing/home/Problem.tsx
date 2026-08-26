import { AlarmClock, ArrowDown, Target, UserX, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Container, Reveal, SectionHeading, Stage } from "./primitives";
import { stagger } from "./motion";

/**
 * The problem, as four readings off a broken dashboard.
 *
 * Each card leads with the number, because the number is the argument — "4h 12m" says
 * more about a WhatsApp inbox than a paragraph about response times can. The line
 * underneath is a label for the figure, never a substitute for it.
 *
 * Server component: nothing here is interactive, so it costs the client bundle
 * nothing. The arrival animation is CSS keyed off one observer.
 */

const READINGS = [
  {
    icon: AlarmClock,
    value: "4h 12m",
    label: "First reply",
    line: "By then they have asked someone else.",
    tone: "text-rose-600",
    meter: 86,
    meterTone: "from-amber-400 to-rose-500",
  },
  {
    icon: Target,
    value: "500 units",
    label: "Buyer intent, missed",
    line: "Nobody flagged it. Nobody followed up.",
    tone: "text-slate-900",
    meter: 100,
    meterTone: "from-emerald-400 to-emerald-500",
  },
  {
    icon: UserX,
    value: "Unknown",
    label: "Lead status",
    line: "Every chat looks the same until someone reads it.",
    tone: "text-slate-400",
    meter: 18,
    meterTone: "from-slate-300 to-slate-400",
  },
  {
    icon: Users,
    value: "3 agents",
    label: "No clear ownership",
    line: "One number, three phones, no answer.",
    tone: "text-slate-900",
    meter: 55,
    meterTone: "from-sky-300 to-violet-400",
  },
];

export function Problem() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-emerald-50/50 via-white to-white py-12 sm:py-14">
      <Container>
        <SectionHeading
          align="center"
          eyebrow="The problem"
          title="WhatsApp is where your leads are. It is also where they disappear."
        />

        <Stage className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {READINGS.map((reading, i) => (
            <div
              key={reading.label}
              style={stagger(i, 90)}
              className="wa-lift group rounded-2xl bg-white p-4 shadow-sm ring-1 ring-inset ring-slate-900/5 transition duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-900/5 hover:ring-slate-900/10"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 ring-1 ring-inset ring-slate-900/5 transition-colors duration-300 group-hover:bg-rose-50 group-hover:ring-rose-500/15">
                <reading.icon className="h-4 w-4 text-slate-400 transition-colors duration-300 group-hover:text-rose-500" />
              </span>

              <p
                className={cn(
                  "nums mt-3 text-2xl font-bold tracking-tight sm:text-[1.75rem]",
                  reading.tone,
                )}
              >
                {reading.value}
              </p>
              <p className="mt-0.5 text-xs font-medium text-slate-600">{reading.label}</p>

              <span className="mt-3 block h-1 overflow-hidden rounded-full bg-slate-100">
                <span
                  style={{ width: `${reading.meter}%`, ...stagger(i, 90, 260) }}
                  className={cn(
                    "wa-grow-x block h-full rounded-full bg-gradient-to-r",
                    reading.meterTone,
                  )}
                />
              </span>

              <p className="mt-3 text-[11px] leading-relaxed text-slate-500">{reading.line}</p>
            </div>
          ))}
        </Stage>

        {/* The turn. One line, and the arrow that makes it read as a consequence of
            the four cards above rather than a new claim. */}
        <Reveal delay={180}>
          <div className="mt-7 flex flex-col items-center gap-2">
            <ArrowDown aria-hidden className="h-4 w-4 text-emerald-500" />
            <p className="text-center text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
              WhatsCRM fixes this automatically.
            </p>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
