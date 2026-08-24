import {
  BarChart3,
  BookOpen,
  Bot,
  Megaphone,
  MessageSquare,
  Sparkles,
  Target,
  Ticket,
  UserCog,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Container, GlowCard, Reveal, SectionHeading } from "./primitives";
import { stagger } from "./motion";

/**
 * The capability grid.
 *
 * Every entry maps to a shipped surface in this repository — the sidebar in
 * components/dashboard/Sidebar.tsx is the checklist. Nothing aspirational appears
 * here, and no adoption or volume figure appears anywhere in this section, because
 * the project has no verified ones to publish.
 *
 * GRID GEOMETRY, because it is the whole reason this section is laid out the way it is.
 *
 * The lead tile spans 2 columns AND 2 rows. That is not decoration: with a 1-row lead
 * tile the card beside it stretches to match its height and ends up two-thirds empty,
 * and with nine secondary cards the last row of a 3-column grid is left with a hole.
 *
 * Eight secondary cards is the count that divides cleanly at every breakpoint:
 *   3 columns → lead tile fills rows 1-2 of columns 1-2, two cards stack beside it in
 *               column 3, the remaining six fill rows 3-4. Four full rows, no gaps.
 *   2 columns → lead tile fills rows 1-2 entirely, eight cards fill rows 3-6.
 *   1 column  → everything stacks.
 *
 * `auto-rows-fr` is what keeps every row the same height, so the lead tile is exactly
 * twice a normal card rather than whatever its content happens to measure. No card
 * carries a margin of its own.
 *
 * Templates used to be a tenth card, which is what left the hole. It is folded into
 * Campaigns because that is how the product actually works — a campaign references a
 * template — so nothing was dropped merely to make the arithmetic come out.
 */

const PRIMARY = {
  icon: MessageSquare,
  title: "Shared WhatsApp inbox",
  description:
    "Every conversation from your WhatsApp Business number in one place — assignable to an agent, filterable by status, with internal notes your customer never sees and quick replies your team fires with a slash.",
};

const CAPABILITIES = [
  {
    icon: Sparkles,
    title: "AI replies, grounded",
    description:
      "Answers drafted from your own documents, with the source file recorded on every message.",
  },
  {
    icon: Target,
    title: "BANT lead qualification",
    description:
      "AI reads the thread and scores budget, authority, need and timeline back onto the lead.",
  },
  {
    icon: Bot,
    title: "Automation & flows",
    description:
      "A visual builder with twelve block types — menus, conditions, API calls, handoff to a human.",
  },
  {
    icon: Megaphone,
    title: "Campaigns & templates",
    description:
      "Author templates, submit them to Meta for approval, then broadcast to segmented lists with per-recipient delivery tracking.",
  },
  {
    icon: BookOpen,
    title: "Knowledge base",
    description:
      "Upload PDFs and documents; the AI retrieves from them before it writes a single word.",
  },
  {
    icon: BarChart3,
    title: "Analytics",
    description:
      "Conversations, response time, leads, won deals and conversion rate, computed from your data.",
  },
  {
    icon: Ticket,
    title: "Support tickets",
    description:
      "Turn a conversation into a ticket with a priority-derived SLA deadline and an owner.",
  },
  {
    icon: UserCog,
    title: "Team & roles",
    description:
      "Six roles, invite by email, and route-level permissions that keep agents on agent surfaces.",
  },
];

const CHIPS = [
  { label: "Assigned", value: "Priya S.", dot: "bg-sky-400" },
  { label: "Status", value: "Open", dot: "bg-emerald-500" },
  { label: "Stage", value: "Qualified", dot: "bg-amber-400" },
];

export function Capabilities() {
  return (
    <section className="relative overflow-hidden bg-white py-20 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="Platform"
          title="Everything your team needs to convert WhatsApp conversations"
          description="One inbox, one API, one source of truth for every conversation — from the first reply to the closed deal."
        />

        <div className="mt-12 grid gap-4 sm:auto-rows-fr sm:grid-cols-2 lg:grid-cols-3">
          {/* Lead tile — 2 columns × 2 rows. See the geometry note above. */}
          <Reveal className="sm:col-span-2 sm:row-span-2">
            <GlowCard className="h-full" innerClassName="flex h-full flex-col p-7">
              <span className="wa-icon-tilt flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-600/15">
                <PRIMARY.icon className="h-5 w-5 text-emerald-600" />
              </span>
              <h3 className="mt-5 text-lg font-semibold tracking-tight text-slate-900">
                {PRIMARY.title}
              </h3>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
                {PRIMARY.description}
              </p>

              <div className="mt-auto grid gap-2 border-t border-slate-100 pt-5 sm:grid-cols-3">
                {CHIPS.map((chip, i) => (
                  <div
                    key={chip.label}
                    style={stagger(i, 90, 220)}
                    className="wa-pop rounded-xl bg-slate-50 px-3.5 py-3 ring-1 ring-inset ring-slate-900/5"
                  >
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      {chip.label}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                      <span className={cn("h-1.5 w-1.5 rounded-full", chip.dot)} />
                      {chip.value}
                    </p>
                  </div>
                ))}
              </div>
            </GlowCard>
          </Reveal>

          {CAPABILITIES.map((item, i) => (
            <Reveal key={item.title} delay={80 + i * 60}>
              <GlowCard className="h-full" innerClassName="flex h-full flex-col">
                <span className="wa-icon-tilt flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-600/15">
                  <item.icon className="h-4.5 w-4.5 text-emerald-600" />
                </span>
                <h3 className="mt-4 text-base font-semibold tracking-tight text-slate-900">
                  {item.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{item.description}</p>
              </GlowCard>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
