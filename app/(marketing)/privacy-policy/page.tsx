import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/marketing/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy — WhatsCRM",
  description:
    "How WhatsCRM collects, uses, stores and protects your data, and the rights you have over it.",
};

const SECTIONS: LegalSection[] = [
  {
    heading: "Data We Collect",
    paragraphs: [
      "We collect only the data we need to run WhatsCRM for you. This falls into three groups.",
    ],
    bullets: [
      "Account data: your name, work email, phone number, company name and hashed password.",
      "Workspace data: the contacts, conversations, messages, leads, tickets and documents you or your customers create inside the product.",
      "Usage data: log records such as IP address, browser type, pages visited and error traces, used to keep the service secure and reliable.",
      "Billing data: your plan, billing cycle and invoices. Card details are handled entirely by our payment processor and never touch our servers.",
    ],
  },
  {
    heading: "How We Use Your Data",
    paragraphs: [
      "Your data is used to deliver the service you signed up for and nothing more. Specifically, we use it to operate your workspace, send and receive WhatsApp messages on your behalf, generate AI replies and lead scores, produce your analytics, bill you correctly and respond to your support requests.",
      "We do not sell your data. We do not use the contents of your conversations to train any AI model, ours or a third party's.",
    ],
  },
  {
    heading: "Data Storage & Security",
    paragraphs: [
      "Workspace data is stored in encrypted PostgreSQL databases and is encrypted in transit over TLS. Every workspace is logically isolated, so one customer's data can never be queried from another customer's account.",
      "Access to production data is restricted to the small number of engineers who need it to operate the service, is logged, and requires multi-factor authentication.",
    ],
  },
  {
    heading: "Third-Party Services",
    paragraphs: [
      "We rely on a small set of vendors to run the product. Each receives only the minimum data required for its function:",
    ],
    bullets: [
      "Meta (WhatsApp Business Cloud API) — to send and receive your WhatsApp messages.",
      "Groq — to generate AI replies, summaries and lead scores. Message content sent for inference is not retained for training.",
      "Neon — managed PostgreSQL hosting for your workspace data.",
      "Pusher — real-time delivery of new messages to your open inbox.",
      "Our payment processor — to handle subscriptions and invoices.",
    ],
  },
  {
    heading: "Data Retention",
    paragraphs: [
      "We keep your workspace data for as long as your account is active. If you cancel, your data stays available in read-only mode for 30 days so you can export it, after which it is permanently deleted from our production systems. Encrypted backups are purged within a further 60 days.",
    ],
  },
  {
    heading: "Your Rights",
    paragraphs: [
      "You are in control of your data at all times. You may:",
    ],
    bullets: [
      "Access and export your contacts, conversations and leads as CSV from your dashboard.",
      "Correct any inaccurate account or contact information.",
      "Request deletion of your account and all associated data.",
      "Object to or restrict specific processing, including turning off all AI features.",
      "Withdraw consent for marketing email at any time via the unsubscribe link.",
    ],
  },
  {
    heading: "Cookies",
    paragraphs: [
      "We use strictly necessary cookies to keep you signed in and to protect against cross-site request forgery. We use a small number of analytics cookies to understand which pages of this website are useful. We do not run third-party advertising cookies.",
    ],
  },
  {
    heading: "Children's Privacy",
    paragraphs: [
      "WhatsCRM is a business product and is not directed at anyone under the age of 18. We do not knowingly collect personal data from children.",
    ],
  },
  {
    heading: "Changes to This Policy",
    paragraphs: [
      "If we make a material change to this policy we will notify you by email and inside the product at least 14 days before it takes effect. Continuing to use WhatsCRM after that date means you accept the updated policy.",
    ],
  },
  {
    heading: "Contact Us",
    paragraphs: [
      "For any privacy question or to exercise the rights above, write to privacy@whatscrm.in or to Corescent Technologies Pvt Ltd, 4th Floor, Indiranagar, Bengaluru 560038, India. We respond to every request within 30 days.",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      lastUpdated="1 July 2026"
      intro="This policy explains what data WhatsCRM collects, why we collect it, how we protect it, and the control you have over it. It applies to whatscrm.in and to the WhatsCRM application."
      sections={SECTIONS}
      footer={
        <p className="text-sm leading-relaxed text-gray-600">
          Questions about this policy? Email{" "}
          <a href="mailto:privacy@whatscrm.in" className="font-semibold text-[#6C3FC4] hover:underline">
            privacy@whatscrm.in
          </a>{" "}
          and a real person will get back to you.
        </p>
      }
    />
  );
}
