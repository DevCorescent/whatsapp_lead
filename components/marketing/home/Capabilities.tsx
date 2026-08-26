import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Bot,
  Megaphone,
  MessageSquare,
  Target,
  Ticket,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { Container, Reveal, SectionHeading, Stage } from "./primitives";
import { stagger } from "./motion";

/**
 * The capability grid, in the dark band.
 *
 * Every entry maps to a shipped surface in this repository — the sidebar in
 * components/dashboard/Sidebar.tsx is the checklist. Nothing aspirational appears
 * here, and no adoption or volume figure appears anywhere in this section, because
 * the project has no verified ones to publish.
 *
 * One line each, and clicking a card does nothing. That is deliberate: an earlier
 * version opened a panel with a fuller description per card, which turned a grid
 * meant to be scanned in five seconds into eight things to read. The workflow above
 * has already made the argument; this is the checklist that confirms it.
 *
 * DARK GLASS, NOT DARK CARDS. Each tile is a translucent white wash over the band's
 * own gradient with a hairline border, so the mesh behind it shows through and the
 * grid reads as one surface with eight regions rather than eight rectangles dropped
 * on a background. Hover raises the tile, lights the border, and fades in an emerald
 * aura underneath — three cheap properties, no layout, no repaint of the band.
 *
 * It renders inside DarkBand and therefore paints no background of its own; the
 * `border-t` is the only thing separating it from the workflow above.
 */

const FEATURES: { icon: LucideIcon; title: string; line: string }[] = [
  {
    icon: MessageSquare,
    title: "Shared WhatsApp inbox",
    line: "One number, your whole team, no group chat.",
  },
  {
    icon: BookOpen,
    title: "AI replies & knowledge base",
    line: "Answers from your own documents, with the source.",
  },
  {
    icon: Target,
    title: "Lead qualification (BANT)",
    line: "Budget, authority, need and timeline, scored.",
  },
  {
    icon: Bot,
    title: "Automation & flows",
    line: "Twelve blocks, dragged onto a canvas. No code.",
  },
  {
    icon: Megaphone,
    title: "Campaigns & templates",
    line: "Broadcast to a segment, tracked per recipient.",
  },
  {
    icon: BarChart3,
    title: "Analytics & reports",
    line: "Response time, leads, deals and conversion.",
  },
  {
    icon: Ticket,
    title: "Support tickets",
    line: "Any conversation becomes a ticket with an SLA.",
  },
  {
    icon: UserCog,
    title: "Team & roles",
    line: "Six roles, invite by email, route permissions.",
  },
];

export function Capabilities() {
  return (
    <section className="relative border-t border-white/[0.06] py-14 sm:py-16">
      <Container>
        <SectionHeading
          align="center"
          tone="dark"
          eyebrow="Features"
          title="Everything the workflow needs"
          description="Eight surfaces, one workspace. Each is shipped and in the product today."
        />

        <Stage className="mt-9">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((item, i) => (
              <li key={item.title} style={stagger(i, 60)} className="wa-lift">
                <div className="wa-glass group relative flex h-full items-start gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4 backdrop-blur hover:border-emerald-400/30 hover:bg-white/[0.06] hover:shadow-[0_18px_40px_-20px_rgba(16,185,129,0.45)]">
                  {/* The aura. A sibling layer behind the tile so the blur can spill
                      past its bounds without softening the border. */}
                  <span
                    aria-hidden
                    className="wa-aura pointer-events-none absolute -inset-px -z-10 rounded-2xl bg-gradient-to-b from-emerald-400/25 to-teal-400/5 blur-md"
                  />

                  <span className="wa-icon-tilt relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 transition-colors duration-300 group-hover:border-emerald-400/50 group-hover:bg-emerald-400/20">
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-xl bg-emerald-400/0 blur-sm transition-colors duration-300 group-hover:bg-emerald-400/25"
                    />
                    <item.icon className="relative h-4 w-4 text-emerald-300 transition-colors duration-300 group-hover:text-emerald-200" />
                  </span>

                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold tracking-tight text-white">
                      {item.title}
                    </h3>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-400 transition-colors duration-300 group-hover:text-slate-300">
                      {item.line}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Stage>

        <Reveal delay={120}>
          <div className="mt-8 flex justify-center">
            <Link
              href="/features"
              className="group inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-5 py-2.5 text-sm font-semibold text-white backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:border-emerald-400/40 hover:bg-emerald-400/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            >
              Explore every feature
              <ArrowRight className="h-4 w-4 text-emerald-300 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
