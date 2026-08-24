import { AtSign, Check, StickyNote, UserCheck, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Container, Reveal, SectionHeading } from "./primitives";
import { stagger } from "./motion";

/**
 * The team half of the inbox story.
 *
 * The hero already showed the conversation. This section shows the thing a personal
 * WhatsApp account cannot do: several people working the same number without
 * standing on each other. The visual is therefore the assignment rail, not the chat.
 */

const POINTS = [
  {
    icon: UserCheck,
    title: "Assign, and it stays assigned",
    body: "Every thread has an owner and a status — Open, Assigned, Resolved, Closed. Filter to Mine and see only what is yours.",
  },
  {
    icon: StickyNote,
    title: "Internal notes the customer never sees",
    body: "Leave context on the thread for whoever picks it up next. Notes are stored on the conversation and never sent to WhatsApp.",
  },
  {
    icon: Zap,
    title: "Quick replies on a slash",
    body: "Type / and pick a saved shortcode. The answers your team repeats twenty times a day stop being retyped.",
  },
  {
    icon: AtSign,
    title: "Roles that actually restrict",
    body: "Six roles, enforced at the route. An agent gets the inbox, contacts, leads and tickets — not billing, settings or the team page.",
  },
];

const QUEUE = [
  { initials: "RM", name: "Rohit Mehta", agent: "Priya", tone: "bg-emerald-500", status: "Assigned", statusTone: "sky" },
  { initials: "SP", name: "Sneha Patil", agent: "Unassigned", tone: "bg-sky-500", status: "Open", statusTone: "emerald" },
  { initials: "AK", name: "Arjun Kulkarni", agent: "Vikram", tone: "bg-violet-500", status: "Assigned", statusTone: "sky" },
  { initials: "DN", name: "Divya Nair", agent: "Priya", tone: "bg-amber-500", status: "Resolved", statusTone: "slate" },
  { initials: "FS", name: "Farhan Shaikh", agent: "Unassigned", tone: "bg-rose-500", status: "Open", statusTone: "emerald" },
];

export function SharedInbox() {
  return (
    <section className="relative overflow-hidden bg-white py-20 sm:py-28">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
              <SectionHeading
                eyebrow="Shared inbox"
                title="One inbox. Your entire team."
                description="Stop running the business number out of one person's phone. Everyone sees the same conversations, and no two people answer the same customer."
              />

            <dl className="mt-10 space-y-6">
              {POINTS.map((point, i) => (
                <Reveal key={point.title} delay={i * 80}>
                  <div className="flex gap-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-600/15">
                      <point.icon className="h-4 w-4 text-emerald-600" />
                    </span>
                    <div>
                      <dt className="text-sm font-semibold text-slate-900">{point.title}</dt>
                      <dd className="mt-1 text-sm leading-relaxed text-slate-600">{point.body}</dd>
                    </div>
                  </div>
                </Reveal>
              ))}
            </dl>
          </div>

          <Reveal delay={120}>
            <div className="relative">
              <div
                aria-hidden
                className="absolute -inset-6 rounded-[2rem] bg-[radial-gradient(closest-side,rgba(16,185,129,0.10),transparent_100%)]"
              />
              <div className="relative overflow-hidden rounded-2xl bg-white shadow-xl shadow-slate-900/5 ring-1 ring-inset ring-slate-900/5">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
                  <p className="text-sm font-semibold text-slate-900">Conversations</p>
                  <div className="flex -space-x-1.5">
                    {["P", "V", "A"].map((letter, i) => (
                      <span
                        key={letter}
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-white",
                          i === 0 && "bg-emerald-500",
                          i === 1 && "bg-sky-500",
                          i === 2 && "bg-violet-500",
                        )}
                      >
                        {letter}
                      </span>
                    ))}
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500 ring-2 ring-white">
                      +5
                    </span>
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {QUEUE.map((row, i) => (
                    <div
                      key={row.name}
                      style={stagger(i, 90, 180)}
                      className="wa-lift flex items-center gap-3 px-5 py-3.5"
                    >
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white",
                          row.tone,
                        )}
                      >
                        {row.initials}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{row.name}</p>
                        <p className="truncate text-xs text-slate-500">
                          {row.agent === "Unassigned" ? (
                            <span className="text-amber-600">Unassigned</span>
                          ) : (
                            <>Assigned to {row.agent}</>
                          )}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-md px-2 py-1 text-[10px] font-medium ring-1 ring-inset",
                          row.statusTone === "emerald" &&
                            "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
                          row.statusTone === "sky" && "bg-sky-50 text-sky-700 ring-sky-600/20",
                          row.statusTone === "slate" &&
                            "bg-slate-100 text-slate-600 ring-slate-500/20",
                        )}
                      >
                        {row.status}
                      </span>
                    </div>
                  ))}
                </div>

                {/* An internal note, styled the way the product styles them. */}
                <div className="border-t border-slate-100 bg-amber-50/50 px-5 py-3.5">
                  <div className="flex items-start gap-2.5">
                    <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-amber-800">
                        Internal note · Priya
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-amber-900/80">
                        Quoted ₹340/unit. Waiting on their PO — follow up Thursday.
                      </p>
                    </div>
                    <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px] text-amber-700">
                      <Check className="h-3 w-3" />
                      Not sent
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
