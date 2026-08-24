import {
  Clock,
  Equal,
  Flag,
  GitBranch,
  HelpCircle,
  ListTree,
  MessageSquare,
  Sparkles,
  UserCheck,
  Webhook,
  Zap,
  FileCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Container, GridBackdrop, Reveal, SectionHeading } from "./primitives";
import { stagger } from "./motion";

/**
 * The dark band, and the most visually distinctive thing the product owns.
 *
 * The twelve blocks and their accent colours are taken from lib/chatbot/types.ts and
 * components/chatbot/nodeMeta.tsx — the same vocabulary the real builder uses, so a
 * visitor who signs up recognises the canvas they were shown.
 */

const NODES = [
  { icon: Zap, label: "Start", tone: "text-slate-300 bg-white/10" },
  { icon: MessageSquare, label: "Message", tone: "text-emerald-300 bg-emerald-400/15" },
  { icon: FileCheck, label: "Send Template", tone: "text-cyan-300 bg-cyan-400/15" },
  { icon: HelpCircle, label: "Question", tone: "text-sky-300 bg-sky-400/15" },
  { icon: ListTree, label: "Menu", tone: "text-fuchsia-300 bg-fuchsia-400/15" },
  { icon: GitBranch, label: "Condition", tone: "text-amber-300 bg-amber-400/15" },
  { icon: Webhook, label: "API Call", tone: "text-violet-300 bg-violet-400/15" },
  { icon: Clock, label: "Delay", tone: "text-orange-300 bg-orange-400/15" },
  { icon: Equal, label: "Set Variable", tone: "text-teal-300 bg-teal-400/15" },
  { icon: UserCheck, label: "Handoff", tone: "text-rose-300 bg-rose-400/15" },
  { icon: Sparkles, label: "AI Response", tone: "text-indigo-300 bg-indigo-400/15" },
  { icon: Flag, label: "End", tone: "text-slate-400 bg-white/5" },
];

const FLOW = [
  { label: "New message", detail: "Inbound webhook" },
  { label: "Detect intent", detail: "Menu tap or keyword" },
  { label: "AI reply", detail: "Grounded in your docs" },
  { label: "Qualify lead", detail: "BANT scoring" },
  { label: "Assign agent", detail: "Least-loaded, active" },
  { label: "Follow up", detail: "Scheduled or manual" },
];

export function Automation() {
  return (
    <section className="relative overflow-hidden bg-slate-900 py-20 sm:py-28">
      <GridBackdrop dark />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[30rem] w-[60rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(16,185,129,0.16),transparent_100%)]"
      />

      <Container className="relative">
        <SectionHeading
          align="center"
          tone="dark"
          eyebrow="Automation & flows"
          title="Let workflows do the repetitive work"
          description="Build the path a conversation takes without writing code. Twelve block types, a canvas you drag, and a preview that walks the flow before a customer ever sees it."
        />

        {/* The flow rail */}
        <Reveal delay={100}>
          <ol className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:gap-2">
            {FLOW.map((step, i) => (
              <li key={step.label} className="relative">
                <div
                  style={stagger(i, 130, 120)}
                  className={cn(
                    "wa-lift h-full rounded-xl p-4 ring-1 ring-inset transition duration-300 hover:ring-emerald-400/40",
                    i === 2 || i === 3
                      ? "bg-emerald-500/10 ring-emerald-400/30"
                      : "bg-white/5 ring-white/10",
                  )}
                >
                  <span className="nums text-[10px] font-semibold text-emerald-400">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="mt-1.5 text-sm font-semibold text-white">{step.label}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{step.detail}</p>
                </div>
                {i < FLOW.length - 1 && (
                  <span
                    aria-hidden
                    style={stagger(i, 130, 240)}
                    className="wa-rail-x absolute -right-1 top-1/2 hidden h-px w-2 -translate-y-1/2 bg-emerald-400/60 lg:block"
                  />
                )}
              </li>
            ))}
          </ol>
        </Reveal>

        {/* The block palette */}
        <Reveal delay={180}>
          <div className="mt-10 rounded-2xl bg-white/5 p-6 ring-1 ring-inset ring-white/10 sm:p-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Twelve blocks to build with</p>
                <p className="mt-1 text-xs text-slate-400">
                  Drag them onto the canvas, connect them, validate, publish.
                </p>
              </div>
              <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-400/25">
                No code required
              </span>
            </div>

            <ul className="mt-6 flex flex-wrap gap-2">
              {NODES.map((node, i) => (
                <li
                  key={node.label}
                  style={stagger(i, 45, 120)}
                  className={cn(
                    "wa-pop inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ring-1 ring-inset ring-white/10",
                    "transition-transform duration-300 hover:-translate-y-0.5",
                    node.tone,
                  )}
                >
                  <node.icon className="h-3.5 w-3.5" />
                  {node.label}
                </li>
              ))}
            </ul>

            <p className="mt-6 border-t border-white/10 pt-5 text-xs leading-relaxed text-slate-400">
              Menus understand a tap, a digit, a spelled-out number or a keyword — and{" "}
              <span className="text-slate-300">back</span>,{" "}
              <span className="text-slate-300">home</span> and{" "}
              <span className="text-slate-300">agent</span> — because real customers do all of those.
              When a flow hands off, the thread goes to the least-loaded active agent with AI
              switched off.
            </p>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
