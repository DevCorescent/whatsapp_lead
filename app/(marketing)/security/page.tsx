import Link from "next/link";
import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/marketing/LegalPage";

export const metadata: Metadata = {
  title: "Security — WhatsCRM",
  description:
    "How WhatsCRM protects your workspace: tenant isolation, encryption in transit and at rest, access control, and how to report a vulnerability.",
};

/**
 * Security.
 *
 * DESCRIBES CONTROLS, NOT CERTIFICATIONS. Every statement below maps to something
 * enforced in this repository — workspace scoping on every query, role checks on every
 * mutation, hashed passwords, signed webhooks. No compliance badge is claimed, because
 * an unaudited claim on a security page is the single most expensive sentence a SaaS
 * product can publish.
 *
 * The disclosure section gives a real address and a real commitment on response time.
 * A security page without a way to report something is a page that has missed its
 * primary audience.
 */

const SECTIONS: LegalSection[] = [
  {
    heading: "Workspace Isolation",
    paragraphs: [
      "WhatsCRM is multi-tenant, and every record in the database belongs to exactly one workspace. Every query the application makes is scoped to the workspace of the signed-in session before it reaches the database — isolation is enforced in the data layer rather than checked in the interface.",
      "There is no code path that reads across workspaces, including for support. When our team needs to look at your workspace to help you, we ask you first.",
    ],
  },
  {
    heading: "Encryption",
    bullets: [
      "In transit: every connection to the application and to our API is TLS-encrypted. Plain HTTP requests are redirected, never served.",
      "At rest: the database and file storage holding your conversations, documents and contacts are encrypted on disk.",
      "Credentials: passwords are hashed with bcrypt and are never stored, logged or recoverable in plain text — including by us.",
      "Secrets: WhatsApp access tokens and API keys are stored encrypted and are never returned in full through the interface or the API.",
    ],
  },
  {
    heading: "Access Control",
    paragraphs: [
      "Access inside your workspace is yours to decide. Six roles are available, and every mutation is authorised on the server against the acting user's role — a permission cannot be bypassed by calling the API directly.",
    ],
    bullets: [
      "Owner, admin, manager, agent, analyst and viewer roles with distinct permissions.",
      "Invitations are sent by email and expire if unused.",
      "Removing a member revokes their sessions immediately, not at next login.",
      "Plan limits and feature gates are enforced server-side, so no client change can lift them.",
    ],
  },
  {
    heading: "The WhatsApp Connection",
    paragraphs: [
      "WhatsCRM connects to WhatsApp only through the official Meta WhatsApp Business Cloud API. We do not use unofficial libraries, QR-code bridges or anything else that puts your number at risk of being banned.",
      "Inbound webhooks from Meta are signature-verified before they are processed, so a forged request cannot inject a message into your inbox. Outbound webhooks we send to your systems are signed the same way, for the same reason.",
    ],
  },
  {
    heading: "AI and Your Data",
    paragraphs: [
      "The contents of your conversations and the documents you upload are used to answer your customers and nothing else. They are not used to train any model, ours or a third party's.",
      "Retrieval is scoped to your workspace's own documents. One workspace's knowledge base can never surface in another workspace's answers.",
    ],
  },
  {
    heading: "Availability and Backups",
    bullets: [
      "The database is backed up on a regular schedule with point-in-time recovery.",
      "Backups are encrypted and retained under the same isolation rules as live data.",
      "Application errors are logged with enough context to debug them and without message bodies.",
    ],
  },
  {
    heading: "Your Responsibilities",
    paragraphs: [
      "Security is shared. A few things are yours to hold up, and they are the ones most often behind an incident.",
    ],
    bullets: [
      "Use a strong, unique password, and do not share a login between people — invite them instead.",
      "Remove members as soon as they leave your organisation.",
      "Treat an API key like a password: store it in a secret manager, never in a repository.",
      "Tell us immediately if you suspect unauthorised access to your workspace.",
    ],
  },
  {
    heading: "Reporting a Vulnerability",
    paragraphs: [
      "If you believe you have found a security issue, write to security@whatscrm.in with enough detail for us to reproduce it. We acknowledge every report within two working days and will keep you updated until it is resolved.",
      "We will not pursue legal action against anyone who reports a vulnerability in good faith, gives us reasonable time to fix it, and does not access or modify data belonging to anyone else while investigating.",
    ],
  },
  {
    heading: "Data Deletion",
    paragraphs: [
      "You can delete contacts, conversations and documents at any time from inside the product. To delete an entire workspace and everything in it, write to us and we will erase it — including from backups on their next rotation — and confirm in writing when it is done.",
    ],
  },
];

export default function SecurityPage() {
  return (
    <LegalPage
      title="Security"
      lastUpdated="26 August 2026"
      intro="Your conversations are your business. This page describes the controls that keep them yours — what is enforced, where, and what we ask of you in return."
      sections={SECTIONS}
      footer={
        <p className="text-sm leading-relaxed text-gray-600">
          Report a vulnerability at{" "}
          <a
            href="mailto:security@whatscrm.in"
            className="font-medium text-emerald-700 hover:text-emerald-800"
          >
            security@whatscrm.in
          </a>
          . For how we use and retain data, see the{" "}
          <Link
            href="/privacy-policy"
            className="font-medium text-emerald-700 hover:text-emerald-800"
          >
            Privacy Policy
          </Link>
          ; for cookies specifically, see the{" "}
          <Link href="/cookies" className="font-medium text-emerald-700 hover:text-emerald-800">
            Cookie Policy
          </Link>
          .
        </p>
      }
    />
  );
}
