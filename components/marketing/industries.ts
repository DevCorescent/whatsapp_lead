import {
  Briefcase,
  Building2,
  Car,
  GraduationCap,
  HeartPulse,
  Landmark,
  ShoppingBag,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";

/**
 * The industries, in one place.
 *
 * Two views of one list rather than two lists that drift apart. /industries reads the
 * long `summary` and `useCases`; the homepage carousel reads `short` and `line` and
 * shows only the six named in `HOME_INDUSTRIES`. A renamed industry or a changed
 * claim has exactly one place to be changed.
 *
 * `short` exists because the two surfaces have different room: "EdTech & Coaching"
 * is the right label on a page about it and too long for a card in a moving strip.
 */
export type Industry = {
  id: string;
  Icon: LucideIcon;
  /** Full name, for /industries. */
  name: string;
  /** Card label, for the homepage carousel. */
  short: string;
  /** Homepage: the one line on the card — a pain or the relief from it. */
  line: string;
  /** /industries: the long form. */
  summary: string;
  useCases: string[];
};

export const INDUSTRIES: Industry[] = [
  {
    id: "retail",
    Icon: ShoppingBag,
    name: "Retail",
    short: "Retail",
    line: "Customer queries answered instantly.",
    summary:
      "Shoppers ask about stock, sizes and store timings on WhatsApp and expect an answer now. WhatsCRM answers from your own catalogue and keeps the ones worth following up.",
    useCases: [
      "Stock, size and price questions answered instantly",
      "Store timings and location on autopilot",
      "Festive and new-arrival broadcasts to past buyers",
    ],
  },
  {
    id: "real-estate",
    Icon: Building2,
    name: "Real Estate",
    short: "Real Estate",
    line: "Enquiries go cold in a group chat.",
    summary:
      "Property enquiries arrive on WhatsApp and go cold in a group chat. WhatsCRM captures every one and tells you which buyer is actually ready to visit.",
    useCases: [
      "Auto-reply with floor plans, price and location",
      "AI scores buyers on budget and timeline",
      "Site-visit follow-ups that never get forgotten",
    ],
  },
  {
    id: "education",
    Icon: GraduationCap,
    name: "EdTech & Coaching",
    short: "Education",
    line: "The same questions. Every time.",
    summary:
      "Admission season means hundreds of the same questions. Let AI answer fees, batches and syllabus while your counsellors call the serious students.",
    useCases: [
      "Instant answers on fees, batches and EMI",
      "Counsellor assignment by course interest",
      "Bulk campaigns for new batch launches",
    ],
  },
  {
    id: "healthcare",
    Icon: HeartPulse,
    name: "Healthcare & Clinics",
    short: "Healthcare",
    line: "Patients ask, staff gets busy.",
    summary:
      "Appointment requests, reports and reminders in one shared inbox your front desk can actually keep up with.",
    useCases: [
      "Appointment booking and reminder messages",
      "Answer clinic timings and consultation fees",
      "Route enquiries to the right department",
    ],
  },
  {
    id: "services",
    Icon: Briefcase,
    name: "Professional Services",
    short: "Services",
    line: "Leads come in, follow-ups don't.",
    summary:
      "Agencies, consultants and local service businesses win work in the chat and lose it in the follow-up. WhatsCRM keeps every enquiry in a pipeline with an owner.",
    useCases: [
      "Scope and rate questions answered from your docs",
      "Enquiries assigned to the right person automatically",
      "Follow-ups scheduled from the conversation",
    ],
  },
  {
    id: "ecommerce",
    Icon: ShoppingCart,
    name: "E-commerce & D2C",
    short: "E-commerce",
    line: "Cart questions delay purchases.",
    summary:
      "Recover abandoned carts and handle order queries where your customers already are — WhatsApp beats email open rates by 5×.",
    useCases: [
      "Order status and shipping queries on autopilot",
      "Abandoned-cart and restock campaigns",
      "Returns and refunds tracked as tickets",
    ],
  },
  {
    id: "finance",
    Icon: Landmark,
    name: "Finance & Insurance",
    short: "Finance",
    line: "Advisors call unqualified leads all day.",
    summary:
      "Qualify loan and policy leads before an advisor picks up the phone, so their time goes to the applications most likely to convert.",
    useCases: [
      "AI qualification on income and eligibility",
      "Document collection over WhatsApp",
      "Renewal and premium-due reminders",
    ],
  },
  {
    id: "automotive",
    Icon: Car,
    name: "Automotive",
    short: "Automotive",
    line: "Test-drive leads lost before the showroom.",
    summary:
      "From first enquiry to test drive to service reminder — keep the whole customer lifecycle in one pipeline.",
    useCases: [
      "Test-drive booking straight from a chat",
      "Model, variant and finance queries answered",
      "Service and insurance renewal campaigns",
    ],
  },
];

/**
 * The six the homepage carousel shows, in the order it shows them.
 *
 * A curated subset rather than the whole list: the strip is a "you are here" cue, and
 * six is what reads at a glance. /industries still shows all eight.
 */
export const HOME_INDUSTRY_IDS = [
  "retail",
  "real-estate",
  "education",
  "healthcare",
  "services",
  "ecommerce",
] as const;

export const HOME_INDUSTRIES: Industry[] = HOME_INDUSTRY_IDS.map(
  (id) => INDUSTRIES.find((industry) => industry.id === id)!,
);
