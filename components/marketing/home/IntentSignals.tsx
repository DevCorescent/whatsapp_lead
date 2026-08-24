import { ChevronRight, Hand, ListTree, MousePointerClick, TrendingUp, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Container, Reveal, SectionHeading } from "./primitives";
import { stagger } from "./motion";

/**
 * The differentiator.
 *
 * Sending an FAQ menu is table stakes. Recording which question was tapped, weighting
 * it by intent, and surfacing the result as a ranked list of what customers actually
 * asked is the part nothing else in this category does — and the reason a tap is worth
 * more than a page view: the customer chose the question, from a list, inside their own
 * conversation.
 *
 * The answer that comes back is the one a human approved, so this path costs no model
 * call and can never invent a price.
 */

const MENU = [
  { label: "What are your prices?", intent: "buying" },
  { label: "What payment options do you have?", intent: "buying" },
  { label: "Can I schedule a demo?", intent: "buying" },
  { label: "Where do you deliver?", intent: "interest" },
  { label: "What are your support hours?", intent: "none" },
];

const FLOW = ["Question tapped", "Intent detected", "Buying signal", "Lead qualified", "Pipeline"];

const INTEREST = [
  { question: "What are your prices?", intent: "buying", taps: 128, contacts: 96 },
  { question: "What payment options do you have?", intent: "buying", taps: 74, contacts: 61 },
  { question: "Can I schedule a demo?", intent: "buying", taps: 52, contacts: 47 },
  { question: "Where do you deliver?", intent: "interest", taps: 39, contacts: 35 },
  { question: "What are your support hours?", intent: "none", taps: 21, contacts: 20 },
];

const INTENT_STYLE: Record<string, string> = {
  buying: "bg-emerald-100 text-emerald-800",
  interest: "bg-amber-100 text-amber-800",
  none: "bg-slate-100 text-slate-500",
};

const INTENT_LABEL: Record<string, string> = {
  buying: "Buying",
  interest: "Interest",
  none: "General",
};

export function IntentSignals() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-emerald-50/40 to-white py-20 sm:py-28">
      <Container>
        <SectionHeading
          align="center"
          eyebrow="Customer intent"
          title="Know which customer is ready to buy — before you reply"
          description="Send a tappable list of questions into the chat. Every tap returns an answer you approved, and tells you something a page view never could."
        />

        <div className="mt-14 grid items-center gap-10 lg:grid-cols-12 lg:gap-6">
          {/* The phone */}
          <Reveal className="lg:col-span-5">
            <div className="relative mx-auto w-full max-w-[19rem]">
              <div
                aria-hidden
                className="absolute -inset-8 rounded-[3rem] bg-[radial-gradient(closest-side,rgba(16,185,129,0.14),transparent_100%)]"
              />
              <div className="relative overflow-hidden rounded-[2rem] bg-slate-900 p-2.5 shadow-2xl shadow-slate-900/20">
                <div className="overflow-hidden rounded-[1.6rem] bg-[#0b141a]">
                  <div className="flex items-center gap-2.5 bg-slate-800 px-4 py-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-semibold text-white">
                      MA
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-white">Meera Apparel</p>
                      <p className="text-[10px] text-emerald-400">online</p>
                    </div>
                  </div>

                  <div className="space-y-2.5 px-3 py-4">
                    <div className="rounded-xl rounded-tl-sm bg-slate-800 px-3 py-2.5">
                      <div className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-400">
                        <ListTree className="h-3 w-3" />
                        Popular questions
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-200">
                        Tap a question and I&rsquo;ll answer it right away 👇
                      </p>
                    </div>

                    <ul className="space-y-1.5">
                      {MENU.map((item, i) => (
                        <li
                          key={item.label}
                          style={stagger(i, 90, 160)}
                          className={cn(
                            "wa-lift",
                            "flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-[11px] transition",
                            i === 0
                              ? "bg-emerald-500/20 font-semibold text-emerald-200 ring-1 ring-inset ring-emerald-400/40"
                              : "bg-slate-800/70 text-slate-300",
                          )}
                        >
                          <span className="truncate">{item.label}</span>
                          {i === 0 ? (
                            <Hand className="h-3.5 w-3.5 shrink-0 -rotate-12 text-emerald-300" />
                          ) : (
                            <ChevronRight className="h-3 w-3 shrink-0 text-slate-500" />
                          )}
                        </li>
                      ))}
                    </ul>

                    <div className="flex justify-end">
                      <div className="max-w-[88%] rounded-xl rounded-tr-sm bg-emerald-600/25 px-3 py-2.5 ring-1 ring-inset ring-emerald-400/25">
                        <p className="text-[11px] leading-relaxed text-slate-100">
                          Our Ivory Kurta Set is ₹1,899. Bulk pricing starts at 25 units — want the
                          full price list?
                        </p>
                        <p className="mt-1 text-right text-[9px] text-emerald-300/70">
                          Approved answer · no AI credit used
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          {/* The connector */}
          <Reveal delay={140} className="lg:col-span-2">
            <ol className="mx-auto flex max-w-xs flex-row flex-wrap items-center justify-center gap-2 lg:flex-col lg:items-stretch lg:gap-2.5">
              {FLOW.map((step, i) => (
                <li key={step} className="contents">
                  <span
                    style={stagger(i, 110, 120)}
                    className={cn(
                      "wa-pop",
                      "rounded-full px-3 py-1.5 text-center text-[11px] font-medium ring-1 ring-inset",
                      i === 2
                        ? "bg-emerald-600 text-white ring-emerald-600"
                        : "bg-slate-50 text-slate-600 ring-slate-900/5",
                    )}
                  >
                    {step}
                  </span>
                  {i < FLOW.length - 1 && (
                    <span aria-hidden className="hidden justify-center lg:flex">
                      <span className="h-4 w-px bg-emerald-300" />
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </Reveal>

          {/* The interest dashboard */}
          <Reveal delay={220} className="lg:col-span-5">
            <div className="overflow-hidden rounded-2xl bg-white shadow-xl shadow-slate-900/5 ring-1 ring-inset ring-slate-900/5">
              <div className="border-b border-slate-100 px-5 py-4">
                <p className="text-sm font-semibold text-slate-900">Customer interest</p>
                <p className="text-xs text-slate-500">What your customers actually asked</p>
              </div>

              <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
                {[
                  { icon: MousePointerClick, label: "Taps", value: "314" },
                  { icon: Users, label: "Contacts", value: "259" },
                  { icon: TrendingUp, label: "Buying", value: "254" },
                ].map((stat, i) => (
                  <div key={stat.label} style={stagger(i, 100, 160)} className="wa-pop px-4 py-3.5">
                    <stat.icon className="h-3.5 w-3.5 text-emerald-600" />
                    <p className="nums mt-1.5 text-lg font-bold tracking-tight text-slate-900">
                      {stat.value}
                    </p>
                    <p className="text-[10px] text-slate-500">{stat.label}</p>
                  </div>
                ))}
              </div>

              <ul className="divide-y divide-slate-100">
                {INTEREST.map((row, i) => (
                  <li
                    key={row.question}
                    style={stagger(i, 90, 320)}
                    className={cn(
                      "wa-lift flex items-center gap-3 px-5 py-3",
                      i === 0 && "bg-emerald-50/60",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-slate-800">{row.question}</p>
                      <p className="nums text-[10px] text-slate-500">
                        {row.taps} taps · {row.contacts} contacts
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold",
                        INTENT_STYLE[row.intent],
                      )}
                    >
                      {INTENT_LABEL[row.intent]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
