import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import {
  Container,
  GridBackdrop,
  Reveal,
  Spotlight,
} from "@/components/marketing/home/primitives";
import { BlogExplorer } from "@/components/marketing/blog/BlogExplorer";
import { BlogCta } from "@/components/marketing/blog/BlogCta";
import { listPosts } from "@/components/marketing/blog/posts";

export const metadata: Metadata = {
  title: "Insights & guides — WhatsCRM",
  description:
    "Playbooks on WhatsApp marketing, AI automation, lead qualification and running a sales pipeline on the WhatsApp Business API — from the team building WhatsCRM.",
};

/**
 * Blog listing.
 *
 * A server component: the article data is static, so it renders on the server and only
 * the search-and-filter half ships as a client bundle. The Navbar and Footer come from
 * app/(marketing)/layout.tsx, which is why neither appears here.
 */
export default function BlogPage() {
  const posts = listPosts();

  return (
    <div className="bg-slate-50/60">
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden bg-gradient-to-b from-white via-emerald-50/40 to-slate-50/60 pb-14 pt-16 sm:pb-16 sm:pt-20">
        <GridBackdrop />
        <Spotlight />

        <Container className="relative">
          <div className="mx-auto max-w-3xl text-center">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 shadow-sm ring-1 ring-inset ring-emerald-600/20 backdrop-blur">
                <BookOpen className="h-3.5 w-3.5" />
                Insights &amp; guides
              </span>
            </Reveal>

            <Reveal delay={80}>
              <h1 className="mt-6 text-4xl font-bold leading-[1.1] tracking-tight text-balance text-slate-900 sm:text-5xl">
                Insights &amp; guides for WhatsApp growth
              </h1>
            </Reveal>

            <Reveal delay={160}>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
                Practical writing on WhatsApp marketing, AI automation, lead qualification and
                CRM — plus the WhatsApp Business API details that decide whether any of it
                actually works.
              </p>
            </Reveal>

            <Reveal delay={240}>
              <p className="mt-5 text-sm text-slate-500">
                Written by the team building the product.
              </p>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* ── Articles + sidebar ──────────────────────────────────────────── */}
      <section className="pb-16 sm:pb-20">
        <Container>
          <BlogExplorer posts={posts} />
        </Container>
      </section>

      <BlogCta />
    </div>
  );
}
