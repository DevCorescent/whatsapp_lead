import type { Metadata } from "next";

import { Hero } from "@/components/marketing/home/Hero";
import { Capabilities } from "@/components/marketing/home/Capabilities";
import { LeadJourney } from "@/components/marketing/home/LeadJourney";
import { SharedInbox } from "@/components/marketing/home/SharedInbox";
import { KnowledgeBase } from "@/components/marketing/home/KnowledgeBase";
import { IntentSignals } from "@/components/marketing/home/IntentSignals";
import { Qualification } from "@/components/marketing/home/Qualification";
import { Automation } from "@/components/marketing/home/Automation";
import { Campaigns } from "@/components/marketing/home/Campaigns";
import { Analytics } from "@/components/marketing/home/Analytics";
import { Pricing } from "@/components/marketing/home/Pricing";
import { WhyTeams } from "@/components/marketing/home/WhyTeams";
import { Faq } from "@/components/marketing/home/Faq";
import { FinalCta } from "@/components/marketing/home/FinalCta";

export const metadata: Metadata = {
  title: "WhatsCRM — Every WhatsApp chat becomes a qualified lead",
  description:
    "An AI-powered WhatsApp CRM: one shared inbox, replies grounded in your own documents, automated BANT lead qualification, and a pipeline that turns conversations into customers.",
  openGraph: {
    title: "WhatsCRM — Every WhatsApp chat becomes a qualified lead",
    description:
      "One shared inbox, intelligent AI replies, automated lead qualification, and a pipeline built around conversations. Built on the official Meta WhatsApp Business Cloud API.",
    type: "website",
  },
};

/**
 * Public homepage.
 *
 * A server component that composes marketing-only sections. The interactive pieces —
 * scroll reveal, the count-up, the pricing toggle, the FAQ — declare "use client"
 * individually, so the page shell itself still renders on the server and the hero is in
 * the first HTML response rather than waiting on hydration.
 *
 * Section order is the product's own argument, in sequence: what it is, how the loop
 * runs, then each stage of that loop proved one at a time, then price and objections.
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <Capabilities />
      <LeadJourney />
      <SharedInbox />
      <KnowledgeBase />
      <IntentSignals />
      <Qualification />
      <Automation />
      <Campaigns />
      <Analytics />
      <Pricing />
      <WhyTeams />
      <Faq />
      <FinalCta />
    </>
  );
}
