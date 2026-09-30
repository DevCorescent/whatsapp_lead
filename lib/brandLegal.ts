// ============================================================================
// MODULE : Brand legal pages (terms / privacy) for white-label sites
//
// A reseller may paste its own terms and privacy text (Branding page). Lines
// starting with "#" become section headings; blank lines separate paragraphs;
// lines starting with "-" become bullets. With no text, a standard template is
// shown in the brand's own name — never the platform's.
// ============================================================================

import type { LegalSection } from "@/components/marketing/LegalPage";

/** Parse the reseller's plain text into the sections LegalPage renders. */
export function parseLegalText(text: string): LegalSection[] {
  const sections: LegalSection[] = [];
  let current: LegalSection | null = null;
  let para: string[] = [];

  const flush = () => {
    if (para.length && current) current.paragraphs = [...(current.paragraphs ?? []), para.join(" ")];
    para = [];
  };

  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (line.startsWith("#")) {
      flush();
      current = { heading: line.replace(/^#+\s*/, "") || "Section" };
      sections.push(current);
    } else if (!line) {
      flush();
    } else {
      if (!current) {
        current = { heading: "Overview" };
        sections.push(current);
      }
      if (/^[-*•]\s+/.test(line)) {
        flush();
        current.bullets = [...(current.bullets ?? []), line.replace(/^[-*•]\s+/, "")];
      } else {
        para.push(line);
      }
    }
  }
  flush();
  // Headings must be unique (they become anchors).
  const seen = new Map<string, number>();
  return sections.map((s) => {
    const n = (seen.get(s.heading) ?? 0) + 1;
    seen.set(s.heading, n);
    return n > 1 ? { ...s, heading: `${s.heading} (${n})` } : s;
  });
}

interface BrandFacts {
  name: string;
  supportEmail: string | null;
  address: string | null;
}

const contact = (b: BrandFacts) =>
  b.supportEmail
    ? `Questions about this policy can be sent to ${b.supportEmail}${b.address ? `, or by post to ${b.address}` : ""}.`
    : `Questions about this policy can be sent to ${b.name} through the contact details on our website.`;

export function defaultTerms(b: BrandFacts): LegalSection[] {
  return [
    { heading: "Agreement", paragraphs: [`These terms govern your use of the ${b.name} service. By creating an account or using the service you agree to them.`] },
    {
      heading: "Your account",
      paragraphs: ["You are responsible for your account, the people you give access to, and keeping your login details secure."],
    },
    {
      heading: "Acceptable use",
      bullets: [
        "Only message people who have agreed to hear from you, and honour every opt-out request.",
        "Follow WhatsApp's Business and Commerce policies.",
        "Do not send unlawful, misleading, abusive or unsolicited bulk content.",
      ],
    },
    {
      heading: "Plans, credit and payment",
      paragraphs: [
        "Subscription plans are billed in advance. Message credit is prepaid and used as messages are sent; unused credit is not refundable in cash except where the law requires it.",
      ],
    },
    {
      heading: "Suspension",
      paragraphs: [`${b.name} may suspend an account that breaks these terms or leaves invoices unpaid, and will tell you why.`],
    },
    {
      heading: "Liability",
      paragraphs: [`The service is provided as is. To the extent the law allows, ${b.name} is not liable for indirect losses or for messages delayed or blocked by carriers or WhatsApp.`],
    },
    { heading: "Contact", paragraphs: [contact(b)] },
  ];
}

export function defaultPrivacy(b: BrandFacts): LegalSection[] {
  return [
    { heading: "Who we are", paragraphs: [`This policy explains how ${b.name} handles personal data when you use our service.`] },
    {
      heading: "What we collect",
      bullets: [
        "Account details: your name, email address and phone number.",
        "Customer data you add: contacts, conversations and campaign content.",
        "Usage and billing records needed to run and charge for the service.",
      ],
    },
    {
      heading: "How we use it",
      paragraphs: ["To provide the service, send the messages you ask us to send, bill you, keep the service secure, and meet legal obligations. We do not sell personal data."],
    },
    {
      heading: "Your customers' data",
      paragraphs: ["For the contacts and conversations you store, you decide how the data is used and we process it on your instructions."],
    },
    {
      heading: "Sharing",
      paragraphs: ["We share data only with the providers that deliver the service (messaging, hosting and payments), under contracts that protect it, or where the law requires."],
    },
    {
      heading: "Retention and your rights",
      paragraphs: ["We keep data while your account is active and as required by law. You can ask to access, correct or delete your personal data."],
    },
    { heading: "Contact", paragraphs: [contact(b)] },
  ];
}
