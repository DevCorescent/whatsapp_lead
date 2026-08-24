import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

/**
 * The sidebar promo.
 *
 * Deliberately a product card rather than a second email capture: the page already
 * ends with a newsletter band, and asking for the same address twice on one screen
 * reads as desperation. This one asks for the trial instead.
 */
export function NewsletterCard() {
  return (
    <div className="relative isolate overflow-hidden rounded-2xl bg-slate-900 p-5 shadow-lg shadow-slate-900/10">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[radial-gradient(closest-side,rgba(16,185,129,0.35),transparent_100%)]"
      />
      <div aria-hidden className="wa-dots pointer-events-none absolute inset-0 opacity-50" />

      <div className="relative">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-400/25">
          <Sparkles className="h-3 w-3" />
          Try WhatsCRM
        </span>

        <p className="mt-3.5 text-base font-semibold leading-snug text-white">
          Turn WhatsApp chats into qualified leads
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
          One shared inbox, AI replies grounded in your own documents, and a pipeline built
          around conversations.
        </p>

        <Link
          href="/register"
          className="group mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-sm shadow-emerald-500/25 transition hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
        >
          Start Free
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>

        <p className="mt-2.5 text-center text-[11px] text-slate-500">No credit card required.</p>
      </div>
    </div>
  );
}
