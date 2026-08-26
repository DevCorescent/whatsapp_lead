import type { Metadata } from "next";

import { Hero } from "@/components/marketing/home/Hero";
import { Problem } from "@/components/marketing/home/Problem";
import { DarkBand } from "@/components/marketing/home/DarkBand";
import { Workflow } from "@/components/marketing/home/Workflow";
import { Capabilities } from "@/components/marketing/home/Capabilities";
import { Industries } from "@/components/marketing/home/Industries";
import { Pricing } from "@/components/marketing/home/Pricing";
import { Faq } from "@/components/marketing/home/Faq";
import { FinalCta } from "@/components/marketing/home/FinalCta";

export const metadata: Metadata = {
  title: "WhatsCRM — Turn WhatsApp conversations into qualified leads",
  description:
    "An AI-powered WhatsApp CRM: one shared inbox, replies grounded in your own documents, automated BANT lead qualification, and a pipeline that turns conversations into customers.",
  openGraph: {
    title: "WhatsCRM — Turn WhatsApp conversations into qualified leads",
    description:
      "One shared inbox, intelligent AI replies, automated lead qualification, and a pipeline built around conversations. Built on the official Meta WhatsApp Business Cloud API.",
    type: "website",
  },
};

/**
 * Public homepage.
 *
 * A server component that composes marketing-only sections. The interactive pieces —
 * the hero's product frame, the workflow demo, the pricing switcher, the FAQ —
 * declare "use client" individually, so the page shell itself still renders on the
 * server and the hero is in the first HTML response rather than waiting on hydration.
 *
 * SECTION ORDER IS THE SALES CONVERSATION, in the order a stranger has it:
 *
 *   what is it     → Hero: one line, and the product *running* beside it
 *   why care       → Problem: four readings off a broken dashboard
 *   how            → Workflow: six icons, animated left to right
 *   what else      → Capabilities: the checklist, one line per item
 *   is it for me   → Industries: a moving strip of six businesses
 *   what's it cost → Pricing
 *   objections     → Faq, collapsed
 *   act            → FinalCta
 *
 * THE DEMO LIVES IN THE HERO. There used to be a separate "product in action"
 * section that played the same conversation the hero now plays. Two runs of one
 * sequence on one page is the page arguing with itself, and the hero is where it
 * earns the most — a visitor sees the product work before they have scrolled once.
 *
 * BACKGROUNDS CARRY THE RHYTHM. Adjacent sections never share a treatment, so the
 * page reads as chapters rather than as one long scroll: white→green in the hero,
 * green→white for the problem, then ONE dark band — navy→teal — carrying the workflow
 * and the feature grid together, blue→green for industries, green→white for pricing,
 * white→green for the FAQ, and navy→emerald for the close.
 *
 * THE DARK BAND IS THE SPINE. Workflow and Capabilities share a single background
 * (DarkBand) rather than painting two similar navies, which would leave a visible
 * seam and split one argument into two. It is the only dark section above the footer,
 * and that is the whole reason it carries weight — a page where everything is
 * emphasised has nothing emphasised.
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <Problem />
      <DarkBand>
        <Workflow />
        <Capabilities />
      </DarkBand>
      <Industries />
      <Pricing />
      <Faq />
      <FinalCta />
    </>
  );
}
