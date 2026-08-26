import Link from "next/link";
import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/marketing/LegalPage";

export const metadata: Metadata = {
  title: "Cookie Policy — WhatsCRM",
  description:
    "Which cookies WhatsCRM sets, what each one is for, how long it lasts, and how to control them in your browser.",
};

/**
 * Cookie policy.
 *
 * WRITTEN AGAINST WHAT THE APPLICATION ACTUALLY SETS. The session cookie comes from
 * NextAuth, the CSRF and callback cookies come with it, and the preference cookies are
 * the workspace and sidebar state the dashboard stores. No analytics or advertising
 * vendor is named, because none is wired into this repository — listing one "for
 * completeness" would be a disclosure about a thing that does not happen.
 */

const SECTIONS: LegalSection[] = [
  {
    heading: "What Cookies Are",
    paragraphs: [
      "A cookie is a small text file a website asks your browser to store and send back on later requests. They are how a site remembers that you are signed in between one page and the next.",
      "This policy covers cookies and the closely related browser storage we use — localStorage and sessionStorage — because from your point of view they do the same job and you control them the same way.",
    ],
  },
  {
    heading: "Strictly Necessary Cookies",
    paragraphs: [
      "These cannot be switched off. Without them you cannot sign in, and the product does not work.",
    ],
    bullets: [
      "Session cookie — keeps you signed in to your workspace. Expires when your session ends or after 30 days, whichever is sooner.",
      "CSRF token — proves that a form submission came from our own page rather than from another site. Expires with the session.",
      "Callback cookie — carries you back to the page you were on after signing in. Deleted immediately after use.",
      "Load-balancing cookie — keeps a request on the server already handling your session. Expires when you close the browser.",
    ],
  },
  {
    heading: "Preference Cookies",
    paragraphs: [
      "These remember choices you have made so the product does not ask again. Clearing them costs you nothing but the preference itself.",
    ],
    bullets: [
      "Active workspace — which business you last had open, if your account has more than one.",
      "Sidebar state — whether you collapsed the navigation.",
      "Dismissed notices — onboarding hints and banners you have already closed.",
    ],
  },
  {
    heading: "What We Do Not Set",
    paragraphs: [
      "We do not set advertising cookies, we do not run third-party trackers on the product, and we do not sell or share cookie data with anyone for marketing purposes.",
      "We do not use cookies to build a profile of you across other websites. Nothing we store leaves our own domain.",
    ],
  },
  {
    heading: "Cookies Set by Others",
    paragraphs: [
      "Two of our processors set their own cookies on the pages where they operate, and only there.",
    ],
    bullets: [
      "Our payment processor sets cookies on the checkout page to detect fraud and complete the payment. We never see your card details.",
      "Embedded video, where an article includes one, is loaded from the video host and follows that host's own cookie policy.",
    ],
  },
  {
    heading: "How To Control Cookies",
    paragraphs: [
      "Every major browser lets you view, block and delete cookies from its settings, usually under Privacy. You can block everything, block only third-party cookies, or clear what is already stored.",
      "Blocking strictly necessary cookies will sign you out and prevent you from signing back in. That is not a fault you can work around — the session cookie is how the product knows who you are.",
    ],
  },
  {
    heading: "Changes To This Policy",
    paragraphs: [
      "If we add a cookie, this page changes before the cookie ships, and the date at the top moves. If we ever add a category that is not strictly necessary or a preference, we will ask for your consent first rather than adding it quietly.",
    ],
  },
];

export default function CookiePolicyPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      lastUpdated="26 August 2026"
      intro="WhatsCRM uses the smallest set of cookies that lets the product work. This page lists every one of them, what it is for and how long it lasts."
      sections={SECTIONS}
      footer={
        <p className="text-sm leading-relaxed text-gray-600">
          Questions about a specific cookie? Write to{" "}
          <a
            href="mailto:support@whatscrm.in"
            className="font-medium text-emerald-700 hover:text-emerald-800"
          >
            support@whatscrm.in
          </a>
          . You may also want to read our{" "}
          <Link
            href="/privacy-policy"
            className="font-medium text-emerald-700 hover:text-emerald-800"
          >
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/security" className="font-medium text-emerald-700 hover:text-emerald-800">
            Security
          </Link>{" "}
          pages.
        </p>
      }
    />
  );
}
