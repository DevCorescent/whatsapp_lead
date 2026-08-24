"use client";

/**
 * The hero's product visual: a marketing-only recreation of the WhatsCRM inbox.
 *
 * Deliberately a recreation and not the real components. `components/inbox/*` is a
 * live surface — it opens Pusher subscriptions, fires React Query, and expects a
 * session and a conversation id. Rendering it on a public page would mean either
 * mocking a session or loosening those components' assumptions, and both of those
 * change product code to serve a landing page. So the layout, spacing, bubble
 * treatment, badges and action buttons are copied from ChatWindow / ConversationList
 * / ContactPanel, while the markup here is inert and read-only.
 *
 * The pipeline stages and score bands are the genuine ones: DEFAULT_PIPELINE_STAGES
 * and SCORE_STYLE are imported from lib/utils, so if the product's defaults change,
 * this visual changes with them rather than drifting into fiction.
 */

import {
  BadgeCheck,
  Check,
  CheckCheck,
  FileText,
  Paperclip,
  Search,
  Send,
  Smile,
  Sparkles,
  Star,
} from "lucide-react";
import { cn, DEFAULT_PIPELINE_STAGES, SCORE_STYLE } from "@/lib/utils";
import { CountUp, MovingBorder, Reveal, RevealScale } from "./primitives";
import { stagger } from "./motion";

// ─── Fixture data ─────────────────────────────────────────────────────────────
//
// Illustrative sample content for the mockup. Named as a fixture so nobody mistakes
// it for live data: these are not customers, and no figure here is presented as a
// platform statistic anywhere on the page.

const THREADS = [
  {
    initials: "RM",
    name: "Rohit Mehta",
    preview: "What's the lead time? We need it b…",
    time: "10:04",
    unread: 2,
    tone: "bg-emerald-500",
    active: true,
  },
  {
    initials: "SP",
    name: "Sneha Patil",
    preview: "Please share the price list 🙏",
    time: "09:52",
    unread: 1,
    tone: "bg-sky-500",
    active: false,
  },
  {
    initials: "AK",
    name: "Arjun Kulkarni",
    preview: "Can we schedule a demo this week?",
    time: "09:31",
    unread: 0,
    tone: "bg-violet-500",
    active: false,
  },
  {
    initials: "DN",
    name: "Divya Nair",
    preview: "Thanks, that answers it.",
    time: "Yest",
    unread: 0,
    tone: "bg-amber-500",
    active: false,
  },
];

const BANT = [
  { label: "Budget", detail: "₹1.7L for the first order" },
  { label: "Authority", detail: "Confirmed decision maker" },
  { label: "Need", detail: "Bulk supply, 500 units" },
  { label: "Timeline", detail: "Before 20 March" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function BrowserChrome() {
  return (
    <div className="flex items-center gap-2 border-b border-slate-200/80 bg-slate-50/80 px-4 py-3">
      <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
      <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
      <div className="ml-3 hidden min-w-0 flex-1 items-center gap-2 rounded-md bg-white px-3 py-1 ring-1 ring-inset ring-slate-200 sm:flex">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
        <span className="truncate text-[11px] text-slate-400">app.whatscrm.in/inbox</span>
      </div>
    </div>
  );
}

function ConversationColumn() {
  return (
    <div className="hidden w-56 shrink-0 flex-col border-r border-slate-200/80 bg-white md:flex lg:w-64">
      <div className="border-b border-slate-100 px-3.5 py-3">
        <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 ring-1 ring-inset ring-slate-200">
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="text-[11px] text-slate-400">Search conversations</span>
        </div>
        <div className="mt-2.5 flex gap-1">
          {["All", "Open", "Mine"].map((tab, i) => (
            <span
              key={tab}
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-medium",
                i === 0 ? "bg-emerald-50 text-emerald-700" : "text-slate-500",
              )}
            >
              {tab}
            </span>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {THREADS.map((thread) => (
          <div
            key={thread.name}
            className={cn(
              "relative flex items-start gap-2.5 px-3.5 py-3",
              thread.active ? "bg-emerald-50/60" : "bg-white",
            )}
          >
            {thread.active && (
              <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-emerald-600" />
            )}
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white",
                thread.tone,
              )}
            >
              {thread.initials}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-semibold text-slate-900">{thread.name}</p>
                <span className="shrink-0 text-[10px] text-slate-400">{thread.time}</span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <p className="truncate text-[11px] text-slate-500">{thread.preview}</p>
                {thread.unread > 0 && (
                  <span className="nums flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-semibold text-white">
                    {thread.unread}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChatColumn() {
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-slate-50/60">
      {/* Thread header — mirrors the real one, including the per-thread AI toggle. */}
      <div className="flex items-center gap-2.5 border-b border-slate-200/80 bg-white px-4 py-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-semibold text-white">
          RM
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-slate-900">Rohit Mehta</p>
          <p className="truncate text-[10px] text-slate-500">+91 98•• ••4210 · online</p>
        </div>
        <span className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 sm:inline-flex">
          <Sparkles className="h-3 w-3" />
          AI on
        </span>
      </div>

      {/* Timeline */}
      <div className="flex-1 space-y-3 px-4 py-4">
        <div className="flex justify-center">
          <span className="rounded-full bg-white px-2.5 py-0.5 text-[10px] text-slate-400 ring-1 ring-inset ring-slate-200">
            Today
          </span>
        </div>

        {/* Inbound */}
        <div className="flex justify-start">
          <div className="max-w-[82%] rounded-2xl rounded-tl-sm bg-white px-3.5 py-2.5 shadow-sm ring-1 ring-inset ring-slate-900/5">
            <p className="text-xs leading-relaxed text-slate-700">
              Hi — do you handle bulk orders? We need around 500 units.
            </p>
            <p className="mt-1 text-[10px] text-slate-400">10:02</p>
          </div>
        </div>

        {/* AI reply, with the knowledge citation the product actually records */}
        <div className="flex justify-end">
          <div
            style={{ transitionDelay: "620ms" }}
            className="wa-lift max-w-[86%] rounded-2xl rounded-tr-sm bg-emerald-50 px-3.5 py-2.5 shadow-sm ring-1 ring-inset ring-emerald-600/15"
          >
            <div className="mb-1.5 flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-emerald-600" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                AI reply
              </span>
            </div>
            <p className="text-xs leading-relaxed text-slate-700">
              Yes, we do. For 500 units the price is ₹340 per unit, and bulk orders ship in 8–10
              working days.
            </p>
            <div className="mt-2 flex items-center gap-1.5 border-t border-emerald-600/15 pt-1.5">
              <FileText className="h-3 w-3 shrink-0 text-emerald-600/70" />
              <span className="truncate text-[10px] text-emerald-700/80">
                Source: Pricing-and-EMI-Policy.pdf
              </span>
            </div>
            <p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-400">
              10:02 <CheckCheck className="h-3 w-3 text-sky-500" />
            </p>
          </div>
        </div>

        {/* Inbound */}
        <div className="flex justify-start">
          <div className="max-w-[82%] rounded-2xl rounded-tl-sm bg-white px-3.5 py-2.5 shadow-sm ring-1 ring-inset ring-slate-900/5">
            <p className="text-xs leading-relaxed text-slate-700">
              Perfect. We need it before 20 March — I can approve the budget today.
            </p>
            <p className="mt-1 text-[10px] text-slate-400">10:04</p>
          </div>
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-slate-200/80 bg-white px-4 py-2.5">
        <div className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-2 ring-1 ring-inset ring-slate-200">
          <Smile className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="flex-1 truncate text-[11px] text-slate-400">Type a message…</span>
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600">
            <Send className="h-3 w-3 text-white" />
          </span>
        </div>
      </div>
    </div>
  );
}

function ContactColumn() {
  return (
    <div className="hidden w-60 shrink-0 flex-col gap-3 border-l border-slate-200/80 bg-white px-3.5 py-4 lg:flex">
      <div className="flex flex-col items-center text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-sm font-semibold text-white">
          RM
        </span>
        <p className="mt-2 text-xs font-semibold text-slate-900">Rohit Mehta</p>
        <p className="text-[10px] text-slate-500">Mehta Traders · Pune</p>
      </div>

      <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-900/5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Lead score
          </span>
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
              SCORE_STYLE.QUALIFIED,
            )}
          >
            QUALIFIED
          </span>
        </div>
        <p className="nums mt-1.5 text-2xl font-bold tracking-tight text-slate-900">85</p>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div
            style={{ transitionDelay: "760ms" }}
            className="wa-grow-x h-full w-[85%] rounded-full bg-emerald-500"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Stage</p>
        <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          Qualified
        </span>
      </div>

      <div className="mt-auto space-y-1.5">
        {["Qualify Lead (AI)", "Summarize (AI)", "Resolve"].map((action, i) => (
          <div
            key={action}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-medium",
              i === 0
                ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/25"
                : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200",
            )}
          >
            {i < 2 && <Sparkles className="h-3 w-3" />}
            {action}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Floating cards ───────────────────────────────────────────────────────────

function QualificationCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "w-[16.5rem] rounded-2xl bg-white/95 p-4 shadow-xl shadow-slate-900/10 ring-1 ring-inset ring-slate-900/5 backdrop-blur",
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          AI qualification
        </span>
      </div>

      <ul className="mt-3 space-y-2">
        {BANT.map((item, i) => (
          <li key={item.label} className="flex items-start gap-2">
            <span
              className="wa-pop mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100"
              style={stagger(i, 130, 160)}
            >
              <Check className="h-2.5 w-2.5 text-emerald-700" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold leading-tight text-slate-800">{item.label}</p>
              <p className="truncate text-[10px] leading-tight text-slate-500">{item.detail}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-end justify-between border-t border-slate-100 pt-3">
        <div>
          <p className="text-[10px] text-slate-500">Score</p>
          <p className="flex items-baseline gap-1.5 text-xl font-bold tracking-tight text-slate-900">
            <span className="nums text-sm font-medium text-slate-300 line-through">40</span>
            <CountUp from={40} to={85} />
          </p>
        </div>
        <span
          className={cn(
            "rounded-md px-2 py-1 text-[10px] font-semibold ring-1 ring-inset",
            SCORE_STYLE.QUALIFIED,
          )}
        >
          QUALIFIED
        </span>
      </div>
    </div>
  );
}

function PipelineCard({ className }: { className?: string }) {
  // The real default pipeline, minus the two closed stages — a card is not the place
  // to explain Won/Lost, and DEFAULT_PIPELINE_STAGES marks them via `outcome`.
  const stages = DEFAULT_PIPELINE_STAGES.filter((s) => s.outcome === "OPEN").slice(0, 4);

  return (
    <div
      className={cn(
        "w-[15rem] rounded-2xl bg-white/95 p-4 shadow-xl shadow-slate-900/10 ring-1 ring-inset ring-slate-900/5 backdrop-blur",
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Pipeline
        </span>
      </div>

      <ul className="mt-3 space-y-1.5">
        {stages.map((stage, i) => {
          const isTarget = stage.name === "Qualified";
          return (
            <li
              key={stage.name}
              style={stagger(i, 110, 240)}
              className={cn(
                "wa-lift flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[11px] transition",
                isTarget
                  ? "bg-emerald-50 font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-600/20"
                  : "text-slate-500",
              )}
            >
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    stage.color === "blue" && "bg-blue-400",
                    stage.color === "violet" && "bg-violet-400",
                    stage.color === "amber" && "bg-amber-400",
                    stage.color === "orange" && "bg-orange-400",
                  )}
                />
                {stage.name}
              </span>
              {isTarget && (
                <span className="relative flex h-2 w-2">
                  <span className="wa-pulse-ring absolute inline-flex h-full w-full rounded-full bg-emerald-400" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-semibold text-white">
          RM
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-semibold text-slate-800">Mehta Traders</p>
          <p className="nums text-[10px] text-slate-500">₹1,70,000 · 2 days in stage</p>
        </div>
      </div>
    </div>
  );
}

function ResponseChip({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-xl bg-slate-900/95 px-3.5 py-2.5 shadow-xl shadow-slate-900/20 backdrop-blur",
        className,
      )}
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15">
        <Star className="h-3.5 w-3.5 text-emerald-400" />
      </span>
      <div>
        <p className="text-[10px] leading-tight text-slate-400">Replied automatically</p>
        <p className="nums text-xs font-semibold leading-tight text-white">in 4 seconds</p>
      </div>
    </div>
  );
}

// ─── Composition ──────────────────────────────────────────────────────────────

export function HeroDashboard() {
  return (
    <div className="relative">
      <RevealScale delay={380}>
        <MovingBorder className="shadow-2xl shadow-emerald-950/10">
          <div className="overflow-hidden rounded-[1.3rem]">
            <BrowserChrome />
            <div className="flex h-[26rem] sm:h-[27rem]">
              <ConversationColumn />
              <ChatColumn />
              <ContactColumn />
            </div>
          </div>
        </MovingBorder>
      </RevealScale>

      {/* Floating overlays.
          Gated at 2xl, not xl, and that is a measured decision rather than a taste
          one. The frame is max-w-5xl, so at 1280 there are only ~96px of gutter beside
          it — a 250px card placed there covers the entire conversation list, which is
          the thing the hero exists to show. At 1536 the gutter is ~224px and the same
          card overlaps the frame by about a fifth: enough to read as layered, not
          enough to hide anything.

          Below 2xl they are not dropped, they move into the stacked row underneath.
          The BANT ticks and the stage move are the story, not decoration. */}
      <div className="pointer-events-none absolute -left-52 top-20 hidden 2xl:block">
        <Reveal delay={520}>
          <div className="wa-float">
            <QualificationCard />
          </div>
        </Reveal>
      </div>

      <div className="pointer-events-none absolute -right-56 bottom-12 hidden 2xl:block">
        <Reveal delay={680}>
          <div className="wa-float-slow">
            <PipelineCard />
          </div>
        </Reveal>
      </div>

      <div className="pointer-events-none absolute -right-40 -top-5 hidden 2xl:block">
        <Reveal delay={840}>
          <div className="wa-float">
            <ResponseChip />
          </div>
        </Reveal>
      </div>

      {/* Stacked fallback for every viewport narrower than 2xl. */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 2xl:hidden">
        <Reveal delay={200}>
          <QualificationCard className="w-full" />
        </Reveal>
        <Reveal delay={320}>
          <PipelineCard className="w-full" />
        </Reveal>
      </div>
    </div>
  );
}
