import {
  BookOpen,
  Brain,
  Gauge,
  MessageSquare,
  Target,
  Workflow as WorkflowIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Container, SectionHeading, Stage } from "./primitives";
import { stagger } from "./motion";

/**
 * How it works, in one line of icons.
 *
 * Six steps, two or three words each, and no sentence anywhere. This is the section
 * that used to be six sections of prose; what survived is the shape of the process,
 * which is the only part a visitor needs before they see the product itself in the
 * demo below.
 *
 * The reveal is the explanation. Steps arrive left to right and each connector grows
 * from the step before it, so watching the section load *is* watching a message
 * travel through the product — which is worth more than any label under an icon.
 * `Stage` drives all of it from one observer, and the stagger is the only timing
 * mechanism: no per-step observers, no scroll listener.
 *
 * FOUR PHASES OVER SIX STEPS. The row is labelled above with the shape of the whole
 * thing — message, AI, action, result — because six equal icons read as six things
 * rather than as an argument. The phase strip says what the row is *for*; the icons
 * say how it gets there.
 *
 * It renders inside DarkBand and therefore paints no background of its own.
 */

const PHASES = [
  { label: "Message", hint: "WhatsApp" },
  { label: "AI", hint: "Understands" },
  { label: "Action", hint: "Qualifies" },
  { label: "Result", hint: "Pipeline" },
];

const STEPS: { icon: LucideIcon; label: string; sub: string }[] = [
  { icon: MessageSquare, label: "Customer message", sub: "WhatsApp" },
  { icon: Brain, label: "AI understands", sub: "In context" },
  { icon: BookOpen, label: "Knowledge base", sub: "Your documents" },
  { icon: Target, label: "Lead qualified", sub: "BANT" },
  { icon: Gauge, label: "Lead score", sub: "0–100" },
  { icon: WorkflowIcon, label: "CRM pipeline", sub: "Assigned" },
];

export function Workflow() {
  // `#how-it-works` moved here when the demo section was folded into the hero. The
  // hero's secondary CTA and a nav item both point at it, so the anchor has to live on
  // whatever section answers "how does this work" — that is now this one.
  return (
    <section id="how-it-works" className="relative scroll-mt-20 py-14 sm:py-16">
      <Container>
        <SectionHeading
          align="center"
          tone="dark"
          eyebrow="How it works"
          title="Six steps that run without you"
          description="A message arrives, the AI reads it against your own documents, the lead is scored, and the pipeline updates — before anyone on your team opens the app."
        />

        {/* The phase strip. Four words for six steps, so the row below has a shape to
            be read against instead of being six unrelated icons. */}
        <Stage className="mt-9">
          <ol className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-2 gap-y-2 sm:gap-x-3">
            {PHASES.map((phase, i) => (
              <li key={phase.label} className="flex items-center gap-2 sm:gap-3">
                <span
                  style={stagger(i, 110)}
                  className="wa-pop inline-flex items-baseline gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 backdrop-blur"
                >
                  <span className="text-[11px] font-semibold tracking-tight text-white">
                    {phase.label}
                  </span>
                  <span className="text-[10px] text-slate-400">{phase.hint}</span>
                </span>
                {i < PHASES.length - 1 && (
                  <span
                    aria-hidden
                    style={stagger(i, 110, 70)}
                    className="wa-grow-x hidden h-px w-6 origin-left bg-gradient-to-r from-emerald-400/60 to-teal-300/30 sm:block"
                  />
                )}
              </li>
            ))}
          </ol>
        </Stage>

        <Stage className="mt-10">
          <ol className="grid grid-cols-2 gap-x-2 gap-y-7 sm:grid-cols-3 lg:grid-cols-6 lg:gap-x-0">
            {STEPS.map((step, i) => (
              <li
                key={step.label}
                className="group relative flex flex-col items-center text-center"
              >
                {/* The connector arrives after the step before it and before the step
                    after it, which is what makes the row read as travel rather than
                    as six things appearing near each other. The lit dot at its centre
                    is the hand-off point between two stages. */}
                {i > 0 && (
                  <span
                    aria-hidden
                    style={stagger(i, 180, 60)}
                    className="wa-grow-x absolute right-1/2 top-7 hidden h-px w-full origin-left bg-gradient-to-r from-emerald-400/15 via-emerald-400/60 to-emerald-300/80 lg:block"
                  >
                    <span className="wa-node-glow absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400" />
                  </span>
                )}

                <span
                  style={stagger(i, 180)}
                  className={cn(
                    "wa-pop relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl",
                    "border border-white/10 bg-white/[0.06] shadow-lg shadow-emerald-950/40 backdrop-blur",
                    "transition duration-300 group-hover:-translate-y-1 group-hover:border-emerald-400/40 group-hover:bg-emerald-400/10",
                  )}
                >
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-2xl bg-emerald-400/15 blur-md transition-opacity duration-300 group-hover:bg-emerald-400/30"
                  />
                  <step.icon className="wa-icon-tilt relative h-6 w-6 text-emerald-300 transition-colors duration-300 group-hover:text-emerald-200" />
                  <span className="nums absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-slate-950 ring-2 ring-slate-950/80">
                    {i + 1}
                  </span>
                </span>

                <p
                  style={stagger(i, 180, 90)}
                  className="wa-lift mt-3 px-1 text-[13px] font-semibold leading-tight text-white"
                >
                  {step.label}
                </p>
                <p
                  style={stagger(i, 180, 140)}
                  className="wa-lift mt-0.5 text-[11px] text-slate-400"
                >
                  {step.sub}
                </p>
              </li>
            ))}
          </ol>
        </Stage>
      </Container>
    </section>
  );
}
