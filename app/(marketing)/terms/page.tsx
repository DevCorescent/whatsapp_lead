import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/marketing/LegalPage";

export const metadata: Metadata = {
  title: "Terms & Conditions — WhatsCRM",
  description:
    "The terms that govern your use of WhatsCRM, including your account, acceptable use, billing and liability.",
};

const SECTIONS: LegalSection[] = [
  {
    heading: "Acceptance of Terms",
    paragraphs: [
      "By creating a WhatsCRM account or using the service, you agree to these Terms & Conditions on behalf of yourself and the organisation you represent. If you do not agree, do not use the service.",
      "These terms are between you and Corescent Technologies Pvt Ltd, a company registered in India, which operates WhatsCRM.",
    ],
  },
  {
    heading: "Your Account",
    paragraphs: [
      "You must provide accurate information when registering and keep it current. You are responsible for everything that happens under your account, including the actions of agents you invite.",
    ],
    bullets: [
      "Keep your password confidential and do not share logins between people.",
      "Tell us immediately at support@whatscrm.in if you suspect unauthorised access.",
      "You must be at least 18 years old and legally able to enter into a contract.",
      "One person may not create multiple free trials to avoid paying for the service.",
    ],
  },
  {
    heading: "Subscriptions & Billing",
    paragraphs: [
      "WhatsCRM is sold as a monthly or annual subscription. Every plan begins with a 14-day free trial that requires no card. When the trial ends, your chosen plan begins and your card is charged unless you cancel first.",
      "Subscriptions renew automatically at the end of each billing cycle until you cancel. Prices are shown exclusive of GST, which is added where applicable. WhatsApp conversation charges levied by Meta are billed to you separately by Meta and are not part of your WhatsCRM subscription.",
      "We may change our prices, but never mid-cycle. Existing customers get at least 30 days' notice by email before a new price applies at their next renewal.",
    ],
  },
  {
    heading: "Plan Limits & Fair Use",
    paragraphs: [
      "Each plan includes limits on contacts, monthly messages and agent seats, as listed on our pricing page. If you exceed a limit, we will notify you and ask you to upgrade; we may pause outbound sending until you do.",
      "Where a plan says 'unlimited', that means unlimited within normal business use. We reserve the right to contact you if usage is so far outside typical patterns that it degrades the service for other customers.",
    ],
  },
  {
    heading: "Acceptable Use",
    paragraphs: [
      "You agree not to use WhatsCRM to do any of the following, and to ensure your agents do not either:",
    ],
    bullets: [
      "Send spam, or message people who have not opted in to hear from you.",
      "Violate WhatsApp's Business Messaging Policy or Meta's Commerce Policy — doing so can get your number banned by Meta, which is outside our control.",
      "Send unlawful, fraudulent, harassing, hateful or misleading content.",
      "Attempt to breach, probe or overload our infrastructure, or access another customer's workspace.",
      "Resell, white-label or sublicense the service except under an Enterprise agreement that permits it.",
      "Reverse engineer the software or use it to build a competing product.",
    ],
  },
  {
    heading: "Your Content & Our Rights",
    paragraphs: [
      "You own everything you put into WhatsCRM — your contacts, conversations, documents and leads. You grant us only the limited licence needed to host, process and display that content in order to provide the service.",
      "We own the WhatsCRM software, brand and everything we create around it. Nothing in these terms transfers that ownership to you.",
    ],
  },
  {
    heading: "Third-Party Services",
    paragraphs: [
      "WhatsCRM depends on third-party platforms, most importantly Meta's WhatsApp Business Cloud API. Your use of WhatsApp through our product is also governed by Meta's terms. We are not responsible for outages, policy changes, number bans or charges originating from Meta or any other third-party provider.",
    ],
  },
  {
    heading: "Service Availability",
    paragraphs: [
      "We work hard to keep WhatsCRM available and fast, and Enterprise customers receive a 99.9% uptime SLA. On all other plans the service is provided on an 'as available' basis. We may carry out maintenance, and will give advance notice for anything planned that causes downtime.",
    ],
  },
  {
    heading: "Suspension & Termination",
    paragraphs: [
      "You may cancel at any time from your dashboard; your plan then runs to the end of the current billing cycle. We may suspend or terminate an account that breaches these terms, fails to pay, or puts the platform or other customers at risk. Where we can, we will warn you first and give you a chance to fix the problem.",
      "After termination your data remains available in read-only mode for 30 days so you can export it, and is then permanently deleted.",
    ],
  },
  {
    heading: "Limitation of Liability",
    paragraphs: [
      "To the maximum extent permitted by law, Corescent Technologies is not liable for indirect, incidental or consequential losses, including lost profits, lost business or lost data. Our total liability arising out of the service in any twelve-month period is limited to the amount you paid us in the twelve months before the claim arose.",
    ],
  },
  {
    heading: "Governing Law",
    paragraphs: [
      "These terms are governed by the laws of India. Any dispute is subject to the exclusive jurisdiction of the courts of Bengaluru, Karnataka.",
    ],
  },
  {
    heading: "Changes to These Terms",
    paragraphs: [
      "We may update these terms as the product evolves. For material changes we give at least 14 days' notice by email and in-product. Continuing to use WhatsCRM after the change takes effect means you accept the new terms.",
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms & Conditions"
      lastUpdated="1 July 2026"
      intro="These terms govern your use of WhatsCRM, operated by Corescent Technologies Pvt Ltd. Please read them carefully — they set out what you can expect from us and what we expect from you."
      sections={SECTIONS}
      footer={
        <p className="text-sm leading-relaxed text-gray-600">
          Need clarification on any clause? Write to{" "}
          <a href="mailto:legal@whatscrm.in" className="font-semibold text-[#6C3FC4] hover:underline">
            legal@whatscrm.in
          </a>
          .
        </p>
      }
    />
  );
}
