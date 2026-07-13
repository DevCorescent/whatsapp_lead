import type { ReactNode } from "react";
import Link from "next/link";
import { Check, MessageSquare } from "lucide-react";

const FEATURES = [
  "Shared WhatsApp inbox",
  "AI lead qualification",
  "Bulk campaigns & templates",
  "Real-time analytics",
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-2">
      {/* ─── Left branding panel ─────────────────────────────────────────── */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-emerald-600 to-emerald-800 p-12 text-white lg:flex">
        {/* Decorative blurred circles */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-emerald-400/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-teal-300/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute right-1/4 top-1/3 h-52 w-52 rounded-full bg-emerald-200/10 blur-2xl"
        />

        {/* Logo */}
        <Link
          href="/"
          className="relative z-10 inline-flex w-fit items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-inset ring-white/25 backdrop-blur-sm">
            <MessageSquare className="h-5 w-5 text-white" />
          </span>
          <span className="text-xl font-bold tracking-tight">WhatsCRM</span>
        </Link>

        {/* Headline + features */}
        <div className="relative z-10 max-w-md">
          <h2 className="text-4xl font-bold leading-tight tracking-tight">
            Turn every WhatsApp chat into a qualified lead.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-emerald-50/90">
            One workspace for your team to talk to customers, score leads with AI and close
            faster — all on the channel your customers already use.
          </p>

          <ul className="mt-8 space-y-3">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-inset ring-white/20">
                  <Check className="h-3.5 w-3.5 text-white" />
                </span>
                <span className="text-sm font-medium text-emerald-50">{feature}</span>
              </li>
            ))}
          </ul>

          {/* Testimonial */}
          <figure className="mt-10 rounded-2xl bg-white/10 p-6 ring-1 ring-inset ring-white/15 backdrop-blur-sm">
            <blockquote className="text-sm leading-relaxed text-white">
              {""WhatsCRM helped us qualify 3x more leads without adding a single agent.""}
            </blockquote>
            <figcaption className="mt-4 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-xs font-semibold text-white">
                RK
              </span>
              <span className="text-xs leading-tight">
                <span className="block font-semibold text-white">Rajesh Kumar</span>
                <span className="block text-emerald-100/80">Director, TechSales India</span>
              </span>
            </figcaption>
          </figure>
        </div>

        <p className="relative z-10 text-xs text-emerald-100/70">
          © 2026 Corescent Technologies Pvt Ltd
        </p>
      </div>

      {/* ─── Right form panel ────────────────────────────────────────────── */}
      <div className="flex min-h-screen flex-col lg:min-h-0">
        {/* Mobile logo */}
        <div className="flex items-center justify-center px-6 pt-10 lg:hidden">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600">
              <MessageSquare className="h-4.5 w-4.5 text-white" />
            </span>
            <span className="text-lg font-bold tracking-tight text-slate-900">WhatsCRM</span>
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-8 lg:py-12">
          <div className="w-full max-w-md">{children}</div>
        </div>

        <p className="px-6 pb-8 text-center text-xs text-slate-400 lg:hidden">
          © 2026 Corescent Technologies Pvt Ltd
        </p>
      </div>
    </div>
  );
}
