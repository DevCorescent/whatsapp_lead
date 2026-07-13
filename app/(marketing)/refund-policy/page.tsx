import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/marketing/LegalPage";

export const metadata: Metadata = {
  title: "Refund Policy — WhatsCRM",
  description:
    "WhatsCRM's 7-day refund window, what is and is not covered, and how to request a refund.",
};

const SECTIONS: LegalSection[] = [
  {
    heading: "The 7-Day Refund Window",
    paragraphs: [
      "If you are not happy with WhatsCRM, you can request a full refund within 7 days of your first paid charge on any plan. No forms to fill in and no justification needed — one email is enough.",
      "This window applies to your first payment only. It covers the initial monthly charge, or the first year of an annual plan.",
    ],
  },
  {
    heading: "Start With the Free Trial",
    paragraphs: [
      "Every plan begins with a 14-day free trial that needs no card. We would much rather you use the trial to be certain the product fits than pay and ask for the money back. If you need longer to evaluate, write to us and we will usually extend it.",
    ],
  },
  {
    heading: "What Is Not Covered",
    paragraphs: ["A refund is not available in the following situations:"],
    bullets: [
      "Requests made more than 7 days after the charge.",
      "Renewal charges — monthly or annual — after your first billing period. Cancel before the renewal date to avoid the next charge.",
      "WhatsApp conversation fees charged directly by Meta. These are billed by Meta, not by us, and we cannot refund them.",
      "Accounts terminated by us for breaching our Terms & Conditions, including sending spam.",
      "Custom development, migration or onboarding work delivered under an Enterprise agreement.",
    ],
  },
  {
    heading: "Cancellations",
    paragraphs: [
      "You can cancel your subscription at any time from Settings → Billing in your dashboard. Cancelling stops all future charges. Your plan stays active until the end of the billing period you have already paid for — we do not cut off access the moment you cancel.",
      "Outside the 7-day window we do not prorate or refund the unused part of a period, including the remaining months of an annual plan.",
    ],
  },
  {
    heading: "How to Request a Refund",
    paragraphs: ["The process is short:"],
    bullets: [
      "Email support@whatscrm.in from the address registered on the account.",
      "Include your workspace name and the invoice number of the charge.",
      "We reply within 2 business days, and we may ask what went wrong — only so we can fix it, never to talk you out of it.",
      "Approved refunds are issued to the original payment method within 5–10 business days, depending on your bank.",
    ],
  },
  {
    heading: "Downgrades",
    paragraphs: [
      "Moving to a cheaper plan takes effect at the start of your next billing cycle, and the price difference is not refunded for the current cycle. Upgrades take effect immediately and we prorate the difference for the remainder of the cycle.",
    ],
  },
  {
    heading: "Failed Payments",
    paragraphs: [
      "If a renewal payment fails, we retry it over the following 7 days and email you each time. Your workspace switches to read-only after 7 days of non-payment and is scheduled for deletion 30 days later. Paying the outstanding invoice at any point in that window restores full access immediately.",
    ],
  },
  {
    heading: "Questions",
    paragraphs: [
      "If anything above is unclear, ask us before you pay rather than after. Write to support@whatscrm.in — we would rather spend ten minutes answering a question than process a refund you did not want to need.",
    ],
  },
];

export default function RefundPolicyPage() {
  return (
    <LegalPage
      title="Refund Policy"
      lastUpdated="1 July 2026"
      intro="We want you to pay for WhatsCRM only if it genuinely works for your team. This policy explains our 7-day refund window, what it covers, and how to claim it."
      sections={SECTIONS}
      footer={
        <p className="text-sm leading-relaxed text-gray-600">
          To request a refund, email{" "}
          <a
            href="mailto:support@whatscrm.in"
            className="font-semibold text-[#6C3FC4] hover:underline"
          >
            support@whatscrm.in
          </a>{" "}
          from your registered address with your workspace name and invoice number.
        </p>
      }
    />
  );
}
