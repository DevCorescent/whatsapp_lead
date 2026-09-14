import type { Metadata } from "next";

import { getHomeContent } from "@/lib/cms/content";
import { Hero } from "@/components/marketing/home/Hero";
import { TrustedLogos } from "@/components/marketing/home/TrustedLogos";
import { Stats } from "@/components/marketing/home/Stats";
import { Problem } from "@/components/marketing/home/Problem";
import { DarkBand } from "@/components/marketing/home/DarkBand";
import { Workflow } from "@/components/marketing/home/Workflow";
import { Capabilities } from "@/components/marketing/home/Capabilities";
import { AiSpotlight } from "@/components/marketing/home/AiSpotlight";
import { MessageTypes } from "@/components/marketing/home/MessageTypes";
import { Integrations } from "@/components/marketing/home/Integrations";
import { Industries } from "@/components/marketing/home/Industries";
import { Testimonials } from "@/components/marketing/home/Testimonials";
import { Pricing } from "@/components/marketing/home/Pricing";
import { Faq } from "@/components/marketing/home/Faq";
import { FinalCta } from "@/components/marketing/home/FinalCta";
import { Newsletter } from "@/components/marketing/home/Newsletter";

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
 * CONTENT COMES FROM THE CMS. `getHomeContent()` reads the saved sections server-side
 * (cached, expired on every admin save) and falls back to the shipped defaults for
 * anything never saved. Hidden sections are skipped here; hidden items were already
 * dropped by the loader. Interactive pieces declare "use client" individually, so
 * the page itself still renders on the server.
 *
 * SECTION ORDER IS THE SALES CONVERSATION:
 *
 *   what is it     → Hero, with the WhatsApp demo running beside the claim
 *   who uses it    → Trusted by, Stats
 *   why care       → Problem
 *   how            → How it works + Platform, together in the one dark band
 *   the AI         → AI spotlight, Message types, Integrations
 *   is it for me   → Industries, Testimonials
 *   what's it cost → Pricing
 *   objections     → FAQ, collapsed
 *   act            → Final CTA, Newsletter
 *
 * Industries is CMS-managed too — heading, link, and which industry cards show in
 * which order — but each card resolves to an industry page defined in
 * components/marketing/industries.ts, so it can never link somewhere that does not exist.
 */
export default async function HomePage() {
  const home = await getHomeContent();

  return (
    <>
      {home.hero.isActive && <Hero section={home.hero} />}
      {home.logos.isActive && <TrustedLogos section={home.logos} />}
      {home.stats.isActive && <Stats section={home.stats} />}
      {home.problem.isActive && <Problem section={home.problem} />}
      {(home.howItWorks.isActive || home.products.isActive) && (
        <DarkBand>
          {home.howItWorks.isActive && <Workflow section={home.howItWorks} />}
          {home.products.isActive && <Capabilities section={home.products} />}
        </DarkBand>
      )}
      {home.ai.isActive && <AiSpotlight section={home.ai} />}
      {home.messageTypes.isActive && <MessageTypes section={home.messageTypes} />}
      {home.integrations.isActive && <Integrations section={home.integrations} />}
      {home.industries.isActive && <Industries section={home.industries} />}
      {home.testimonials.isActive && <Testimonials section={home.testimonials} />}
      {home.pricing.isActive && <Pricing section={home.pricing} />}
      {home.faq.isActive && <Faq section={home.faq} />}
      {home.cta.isActive && <FinalCta section={home.cta} />}
      {home.newsletter.isActive && <Newsletter section={home.newsletter} />}
    </>
  );
}
