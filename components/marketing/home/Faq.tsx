"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Container, Reveal, SectionHeading } from "./primitives";

/**
 * Homepage FAQ.
 *
 * A separate accordion from `components/marketing/FaqAccordion.tsx` rather than a
 * restyle of it: that component is rendered by /pricing, and changing its palette to
 * match this page would edit a surface this task does not own.
 *
 * Every answer describes behaviour that exists today. Where a limit is set by the plan
 * rather than the product, the answer says so instead of implying "unlimited".
 *
 * FIVE QUESTIONS, AND THAT IS THE POINT. This list was eight, which made the homepage's
 * last section its longest and pushed the closing CTA below a screen of collapsed rows
 * nobody opens. What survived is the five a first-time visitor actually has before they
 * sign up — what it is, how it qualifies, where answers come from, can I use my number,
 * what does trying it cost me.
 *
 * The three that went were real answers to narrower questions — multi-agent inboxes,
 * multiple numbers, STOP handling. They are operational detail: they matter once
 * someone is evaluating, not while they are deciding whether to. /pricing and /features
 * carry that weight, and support answers it directly.
 *
 * The remaining answers were also cut to roughly two sentences each. The long form was
 * accurate but read as documentation, and an FAQ that takes a paragraph to answer
 * "what is this" has answered a different question.
 */

const FAQS = [
  {
    question: "What is WhatsCRM?",
    answer:
      "An AI-powered CRM built around your WhatsApp Business number. Incoming messages become contacts and conversations automatically, the AI replies and qualifies the lead, and your team works the result from one shared inbox and pipeline instead of a group chat.",
  },
  {
    question: "How does the AI qualify a lead?",
    answer:
      "It reads the conversation for budget, authority, need and timeline, then turns what it finds into a score from 0 to 100. That score sorts each lead into COLD, WARM, HOT or QUALIFIED, so your team can see which conversations are worth their time first.",
  },
  {
    question: "Where do the AI's answers come from?",
    answer:
      "From the documents you upload to your knowledge base. Before the AI replies it retrieves the passages relevant to what was just asked, and the files it used are recorded on the message — so every answer traces back to your own company information.",
  },
  {
    question: "Can I connect my own WhatsApp number?",
    answer:
      "Yes. WhatsCRM runs on the official Meta WhatsApp Business Cloud API, so you connect your own WhatsApp Business number from Settings. You will need a Meta Business Account with WhatsApp enabled, and the onboarding wizard walks through the credentials step by step.",
  },
  {
    question: "How does the free trial work?",
    answer:
      "Create a workspace and explore the WhatsApp, CRM and AI features without entering card details. Paid plans are billed monthly or annually and can be upgraded, downgraded or cancelled from Billing whenever you decide.",
  },
];

export function Faq() {
  // Every question starts closed. Opening one on load answers a question nobody
  // asked and pushes the rest of the list down the page before it can be scanned.
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section
      id="faq"
      className="relative scroll-mt-20 overflow-hidden bg-gradient-to-b from-white to-emerald-50/40 py-12 sm:py-14"
    >
      <Container>
        <SectionHeading align="center" eyebrow="FAQ" title="Questions, answered" />

        <Reveal delay={80}>
          <div className="mx-auto mt-7 max-w-3xl divide-y divide-slate-200 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-inset ring-slate-900/5">
            {FAQS.map((faq, i) => {
              const isOpen = open === i;
              const triggerId = `home-faq-trigger-${i}`;
              const panelId = `home-faq-panel-${i}`;

              return (
                <div key={faq.question}>
                  <h3>
                    <button
                      type="button"
                      id={triggerId}
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => setOpen(isOpen ? null : i)}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600 sm:px-6"
                    >
                      <span className="text-sm font-semibold text-slate-900 sm:text-base">
                        {faq.question}
                      </span>
                      <Plus
                        aria-hidden
                        className={cn(
                          "h-4.5 w-4.5 shrink-0 transition-transform duration-300",
                          isOpen ? "rotate-45 text-emerald-600" : "text-slate-400",
                        )}
                      />
                    </button>
                  </h3>

                  {/* Grid-rows transition rather than max-height: the panel animates to its
                      real height, so a long answer does not snap open or clip short. */}
                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={triggerId}
                    className={cn(
                      "grid transition-all duration-300 ease-out",
                      isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                    )}
                  >
                    <div className="overflow-hidden">
                      <p className="px-5 pb-4 text-sm leading-relaxed text-slate-600 sm:px-6">
                        {faq.answer}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
