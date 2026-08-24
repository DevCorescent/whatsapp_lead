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
 */

const FAQS = [
  {
    question: "What is WhatsCRM?",
    answer:
      "A CRM built around your WhatsApp Business number. Incoming messages become contacts and conversations automatically, an AI answers them from your own documents, leads are qualified and scored, and your team works the result from a shared inbox and a pipeline — instead of from a group chat.",
  },
  {
    question: "How does the AI qualify a lead?",
    answer:
      "It reads the conversation and judges it against BANT — budget, authority, need and timeline — returning a short reason for each. Those results produce a score from 0 to 100, which sorts the lead into COLD, WARM, HOT or QUALIFIED and is written onto the lead record, not just shown once and forgotten.",
  },
  {
    question: "Where do the AI's answers come from?",
    answer:
      "From documents you upload. Files are indexed, and before the AI writes anything it retrieves the passages relevant to what the customer just asked. The documents it used are recorded on the message, so every AI reply can be traced back to its source — and a wrong answer points you at the file to fix.",
  },
  {
    question: "Can several team members handle the same number?",
    answer:
      "Yes — that is the point of the shared inbox. Conversations can be assigned to an agent and carry a status of Open, Assigned, Resolved or Closed. Internal notes stay inside the app and are never sent to WhatsApp. Six roles control who can reach which surfaces.",
  },
  {
    question: "Can I connect my own WhatsApp number?",
    answer:
      "Yes. WhatsCRM runs on the official Meta WhatsApp Business Cloud API, so you connect your own WhatsApp Business number and phone number ID from Settings. You will need a Meta Business Account with WhatsApp enabled; the onboarding wizard walks through the credentials step by step.",
  },
  {
    question: "Can I run more than one WhatsApp number?",
    answer:
      "Yes. Each business inside your workspace has its own number, inbox, contacts, tags, templates, flows and AI configuration, and you switch between them from the sidebar. How many you can create depends on your plan.",
  },
  {
    question: "What happens when someone replies STOP?",
    answer:
      "They are unsubscribed immediately and sent a confirmation. From that point they are skipped by AI replies, chatbot flows and campaigns until they reply START or SUBSCRIBE to opt back in. This runs before anything else on the inbound path, so nothing can talk over it.",
  },
  {
    question: "How does the free trial work?",
    answer:
      "You can create a workspace and explore the product without entering card details. Paid plans are billed monthly or annually and can be upgraded, downgraded or cancelled from Billing — a cancellation runs to the end of the cycle you have already paid for.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="relative scroll-mt-20 overflow-hidden bg-slate-50 py-20 sm:py-28">
      <Container>
          <SectionHeading align="center" eyebrow="FAQ" title="Questions, answered" />

        <Reveal delay={80}>
          <div className="mx-auto mt-12 max-w-3xl divide-y divide-slate-200 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-inset ring-slate-900/5">
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
                      className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600"
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
                      <p className="px-6 pb-5 text-sm leading-relaxed text-slate-600">
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
