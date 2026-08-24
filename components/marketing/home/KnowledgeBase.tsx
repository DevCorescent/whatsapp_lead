import { ArrowRight, BookOpen, Bot, FileText, MessageSquare, Quote } from "lucide-react";
import { cn } from "@/lib/utils";
import { Container, Reveal, SectionHeading } from "./primitives";
import { stagger } from "./motion";

/**
 * The trust objection, answered with a feature.
 *
 * "What if it makes something up" is the first thing anyone asks about AI on a
 * customer channel. The product's answer is retrieval plus attribution: the reply is
 * drafted from the tenant's own indexed documents, and the documents it used are
 * written onto the message so a wrong answer is traceable to its source.
 *
 * The pipeline below is the real one — extract, chunk, embed, retrieve — stated in
 * plain language rather than in vector-database vocabulary.
 */

const PIPELINE = [
  { icon: FileText, label: "Your documents", detail: "PDF, DOCX, TXT, URLs" },
  { icon: BookOpen, label: "Knowledge base", detail: "Indexed and searchable" },
  { icon: Bot, label: "WhatsCRM AI", detail: "Retrieves, then writes" },
  { icon: MessageSquare, label: "WhatsApp reply", detail: "Sent with its source" },
];

const DOCS = [
  { name: "Refund-and-Shipping-Policy.pdf", size: "312 KB", chunks: 48 },
  { name: "Pricing-and-EMI-Policy.pdf", size: "184 KB", chunks: 26 },
  { name: "Product-Catalogue-2026.docx", size: "2.4 MB", chunks: 173 },
];

export function KnowledgeBase() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-white to-emerald-50/40 py-20 sm:py-28">
      <Container>
        <SectionHeading
          align="center"
          eyebrow="Knowledge base"
          title="AI that knows your business"
          description="Upload what you already have. Every answer your customers get is written from your documents — and tells you which one it came from."
        />

        {/* The pipeline rail */}
        <Reveal delay={80}>
          <ol className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PIPELINE.map((stage, i) => (
              <li key={stage.label} className="relative">
                <div
                  style={stagger(i, 130)}
                  className="wa-lift wa-hover-lift group h-full rounded-2xl bg-white p-5 text-center shadow-sm ring-1 ring-inset ring-slate-900/5 hover:shadow-md hover:ring-emerald-500/25"
                >
                  <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-600/15">
                    <stage.icon className="h-5 w-5 text-emerald-600" />
                  </span>
                  <p className="mt-3.5 text-sm font-semibold text-slate-900">{stage.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{stage.detail}</p>
                </div>
                {i < PIPELINE.length - 1 && (
                  <ArrowRight
                    aria-hidden
                    style={stagger(i, 130, 90)}
                    className="wa-pop absolute -right-3.5 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-emerald-400 lg:block"
                  />
                )}
              </li>
            ))}
          </ol>
        </Reveal>

        {/* Proof: the documents on one side, the cited answer on the other */}
        <div className="mt-8 grid gap-4 lg:grid-cols-5">
          <Reveal delay={140} className="lg:col-span-2">
            <div className="h-full rounded-2xl bg-white p-6 shadow-sm ring-1 ring-inset ring-slate-900/5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Indexed documents
              </p>
              <ul className="mt-4 space-y-2.5">
                {DOCS.map((doc, i) => (
                  <li
                    key={doc.name}
                    style={stagger(i, 100, 140)}
                    className={cn(
                      "wa-lift flex items-center gap-3 rounded-xl px-3.5 py-3 ring-1 ring-inset transition",
                      i === 1
                        ? "bg-emerald-50 ring-emerald-600/20"
                        : "bg-slate-50 ring-slate-900/5",
                    )}
                  >
                    <FileText
                      className={cn(
                        "h-4 w-4 shrink-0",
                        i === 1 ? "text-emerald-600" : "text-slate-400",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-slate-800">{doc.name}</p>
                      <p className="nums text-[10px] text-slate-500">
                        {doc.size} · {doc.chunks} sections indexed
                      </p>
                    </div>
                    {i === 1 && (
                      <span className="shrink-0 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                        Used
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal delay={200} className="lg:col-span-3">
            <div className="flex h-full flex-col rounded-2xl bg-slate-900 p-6 shadow-xl shadow-slate-900/10">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">
                In the customer&rsquo;s WhatsApp
              </p>

              <div className="mt-5 space-y-3">
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-slate-800 px-4 py-3">
                    <p className="text-sm leading-relaxed text-slate-100">
                      What is your refund policy if the size doesn&rsquo;t fit?
                    </p>
                    <p className="mt-1 text-[10px] text-slate-500">14:21</p>
                  </div>
                </div>

                <div className="flex justify-end">
                  <div className="max-w-[88%] rounded-2xl rounded-tr-sm bg-emerald-500/15 px-4 py-3 ring-1 ring-inset ring-emerald-400/25">
                    <p className="text-sm leading-relaxed text-slate-100">
                      You can request a size exchange within 7 days of delivery, as long as the tags
                      are intact. Refunds are processed to the original payment method within 5–7
                      working days.
                    </p>
                    <div className="mt-2.5 flex items-center gap-1.5 border-t border-emerald-400/20 pt-2">
                      <Quote className="h-3 w-3 shrink-0 text-emerald-400" />
                      <span className="truncate text-[11px] text-emerald-300/90">
                        Source: Refund-and-Shipping-Policy.pdf
                      </span>
                    </div>
                    <p className="mt-1.5 text-right text-[10px] text-slate-500">14:21</p>
                  </div>
                </div>
              </div>

              <p className="mt-auto pt-6 text-xs leading-relaxed text-slate-400">
                No invented prices, no invented policies. When an answer is wrong, the citation tells
                you exactly which document to fix.
              </p>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
