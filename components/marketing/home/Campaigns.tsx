import { CalendarClock, CheckCheck, Megaphone, MessageSquareReply, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Container, Reveal, SectionHeading, Stage } from "./primitives";
import { stagger } from "./motion";

/**
 * Broadcasts, and the one number most platforms cannot honestly report.
 *
 * Sent, delivered and read come from Meta's receipts. "Replied" is inferred from the
 * recipient's next inbound message and credited exactly once — which is why the funnel
 * here has four steps and a competitor's usually has three. The counters shown are
 * illustrative; the columns behind them are real (see the Campaign model).
 */

const FUNNEL = [
  { label: "Sent", value: 4820, width: "100%", tone: "bg-slate-300" },
  { label: "Delivered", value: 4693, width: "97%", tone: "bg-emerald-300" },
  { label: "Read", value: 3871, width: "80%", tone: "bg-emerald-400" },
  { label: "Replied", value: 962, width: "20%", tone: "bg-emerald-600", emphasis: true },
];

const CONTROLS = [
  { icon: Users, label: "Segmented audience", detail: "Pick contacts by tag, source or stage" },
  { icon: CalendarClock, label: "Scheduled sends", detail: "Queued and released at the right hour" },
  { icon: CheckCheck, label: "Per-recipient tracking", detail: "Every send has its own status row" },
  { icon: MessageSquareReply, label: "Reply attribution", detail: "A reply is credited once, never twice" },
];

export function Campaigns() {
  return (
    <section className="relative overflow-hidden bg-white py-20 sm:py-28">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <Stage>
            <SectionHeading
                eyebrow="Campaigns"
                title="Reach more customers without losing the personal touch"
                description="Send approved templates to a segment you chose, then watch what actually happened to each message — not just how many left the building."
              />

            <dl className="mt-10 grid gap-5 sm:grid-cols-2">
                {CONTROLS.map((item, i) => (
                  <div key={item.label} style={stagger(i, 80, 120)} className="wa-lift flex gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-600/15">
                      <item.icon className="h-4 w-4 text-emerald-600" />
                    </span>
                    <div>
                      <dt className="text-sm font-semibold text-slate-900">{item.label}</dt>
                      <dd className="mt-0.5 text-xs leading-relaxed text-slate-600">
                        {item.detail}
                      </dd>
                    </div>
                  </div>
                ))}
            </dl>
          </Stage>

          <Reveal delay={120}>
            <div className="relative">
              <div
                aria-hidden
                className="absolute -inset-6 rounded-[2rem] bg-[radial-gradient(closest-side,rgba(16,185,129,0.10),transparent_100%)]"
              />
              <div className="relative overflow-hidden rounded-2xl bg-white shadow-xl shadow-slate-900/5 ring-1 ring-inset ring-slate-900/5">
                <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-600/15">
                    <Megaphone className="h-4 w-4 text-emerald-600" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      March Catalogue Drop
                    </p>
                    <p className="nums text-xs text-slate-500">4,820 recipients · Completed</p>
                  </div>
                  <span className="shrink-0 rounded-md bg-indigo-50 px-2 py-1 text-[10px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-600/20">
                    Completed
                  </span>
                </div>

                <div className="space-y-4 px-6 py-6">
                  {FUNNEL.map((step, i) => (
                    <div key={step.label}>
                      <div className="flex items-baseline justify-between">
                        <span
                          className={cn(
                            "text-xs",
                            step.emphasis
                              ? "font-semibold text-emerald-700"
                              : "font-medium text-slate-600",
                          )}
                        >
                          {step.label}
                        </span>
                        <span
                          className={cn(
                            "nums text-sm font-semibold",
                            step.emphasis ? "text-emerald-700" : "text-slate-900",
                          )}
                        >
                          {step.value.toLocaleString("en-IN")}
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={cn("wa-grow-x h-full rounded-full", step.tone)}
                          style={{ width: step.width, ...stagger(i, 140, 140) }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <p className="border-t border-slate-100 bg-slate-50/60 px-6 py-4 text-xs leading-relaxed text-slate-600">
                  <span className="font-semibold text-slate-800">Replied</span> is the number most
                  platforms cannot show you. Every recipient carries the message id Meta returned, so
                  a reply is matched back to the exact person it came from.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
