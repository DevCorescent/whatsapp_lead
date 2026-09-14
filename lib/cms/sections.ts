// ============================================================================
// MODULE : Website CMS — homepage section specs
// ============================================================================
//
// What an admin can edit on the homepage, section by section. Each spec is the
// single description of a section: lib/cms/fields.ts turns it into the public
// TypeScript types, the server-side validator and the admin form.
//
// ADDING A FIELD is one entry here plus a default in lib/cms/defaults.ts (the
// compiler insists on the second) and whatever the component does with it.
// Content that is already saved keeps working: the loader fills a field the row
// does not have from its default.
//
// Limits are deliberately tight. They are the only thing standing between a
// long paste and a card that breaks the grid, and each one was set against the
// layout it feeds rather than against the database.

import { INDUSTRIES } from "@/components/marketing/industries";
import type { CollectionSpec, FieldSpec, FieldsShape, SectionSpec } from "./fields";

// ─── Reusable field sets ──────────────────────────────────────────────────────

const HEADING_FIELDS = [
  { key: "eyebrow", type: "text", label: "Section label", max: 40, hint: "The small uppercase label above the heading." },
  { key: "title", type: "text", label: "Heading", required: true, max: 110 },
  { key: "description", type: "textarea", label: "Description", max: 260 },
] as const satisfies readonly FieldSpec[];

const SOCIAL_PLATFORMS = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "twitter", label: "X (Twitter)" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "youtube", label: "YouTube" },
] as const;

// ─── Sections ─────────────────────────────────────────────────────────────────

export const CMS_SECTIONS = {
  hero: {
    label: "Hero",
    description: "The first screen: headline, calls to action and the live WhatsApp chat demo.",
    whatsapp: true,
    fields: [
      { key: "badge", type: "text", label: "Badge", max: 50 },
      { key: "title", type: "text", label: "Heading", required: true, max: 90 },
      {
        key: "highlight",
        type: "text",
        label: "Highlighted words",
        max: 50,
        hint: "Shown after the heading with a green marker. Leave empty to skip.",
      },
      { key: "description", type: "textarea", label: "Description", max: 240 },
      { key: "primaryCtaLabel", type: "text", label: "Primary button label", required: true, max: 30, group: "Buttons" },
      { key: "primaryCtaHref", type: "url", label: "Primary button link", required: true, group: "Buttons" },
      { key: "secondaryCtaLabel", type: "text", label: "Secondary button label", max: 30, group: "Buttons", hint: "Leave empty to hide the second button." },
      { key: "secondaryCtaHref", type: "url", label: "Secondary button link", group: "Buttons" },
      { key: "trustNote", type: "text", label: "Trust note", max: 100, group: "Buttons", hint: "Small line under the buttons." },
      { key: "chatContactName", type: "text", label: "Business name in chat header", required: true, max: 40, group: "WhatsApp chat demo" },
      { key: "chatContactStatus", type: "text", label: "Header status", max: 40, group: "WhatsApp chat demo" },
      { key: "chatCustomerMessage", type: "textarea", label: "Customer message", required: true, max: 160, group: "WhatsApp chat demo" },
      { key: "chatAiLabel", type: "text", label: "AI reply label", max: 30, group: "WhatsApp chat demo" },
      { key: "chatAiReply", type: "textarea", label: "AI reply", required: true, max: 220, group: "WhatsApp chat demo" },
      { key: "chatAttachmentName", type: "text", label: "Document name", max: 50, group: "WhatsApp chat demo", hint: "Leave empty to hide the document bubble." },
      { key: "chatAttachmentMeta", type: "text", label: "Document size / type", max: 30, group: "WhatsApp chat demo" },
      { key: "chatTime", type: "text", label: "Message time", max: 12, group: "WhatsApp chat demo" },
      { key: "chatEventCtaLabel", type: "text", label: "Last event button label", max: 20, group: "WhatsApp chat demo" },
      { key: "chatEventCtaHref", type: "url", label: "Last event button link", group: "WhatsApp chat demo" },
    ],
    collections: [
      {
        kind: "stat",
        label: "Hero highlights",
        description: "Short proof points under the buttons.",
        itemLabel: "highlight",
        titleField: "value",
        max: 4,
        fields: [
          { key: "value", type: "text", label: "Value", required: true, max: 16 },
          { key: "label", type: "text", label: "Label", required: true, max: 40 },
        ],
      },
      {
        kind: "event",
        label: "Automation events beside the chat",
        description: "What the system does while the chat plays. Shown in order, up to four.",
        itemLabel: "event",
        titleField: "title",
        max: 4,
        fields: [
          { key: "icon", type: "icon", label: "Icon" },
          { key: "title", type: "text", label: "Title", required: true, max: 30 },
          { key: "body", type: "text", label: "Description", max: 50 },
          { key: "meta", type: "text", label: "Status text", max: 12, hint: "e.g. 1.2s. Leave empty to show “Done”." },
        ],
      },
    ],
  },

  logos: {
    label: "Trusted by",
    description: "The strip of customer names or logos under the hero.",
    fields: [{ key: "title", type: "text", label: "Strip heading", max: 80 }],
    collections: [
      {
        kind: "logo",
        label: "Names and logos",
        itemLabel: "logo",
        titleField: "name",
        max: 12,
        fields: [
          { key: "name", type: "text", label: "Name", required: true, max: 40 },
          { key: "imageUrl", type: "image", label: "Logo image URL", hint: "Optional. Without it the name is shown as a wordmark." },
          { key: "href", type: "url", label: "Link", hint: "Optional." },
        ],
      },
    ],
  },

  stats: {
    label: "Stats",
    description: "A band of headline numbers.",
    fields: [{ key: "title", type: "text", label: "Heading", max: 90, hint: "Optional." }],
    collections: [
      {
        kind: "stat",
        label: "Numbers",
        itemLabel: "number",
        titleField: "value",
        max: 4,
        fields: [
          { key: "value", type: "text", label: "Value", required: true, max: 12 },
          { key: "label", type: "text", label: "Label", required: true, max: 40 },
          { key: "description", type: "text", label: "Supporting line", max: 90 },
        ],
      },
    ],
  },

  problem: {
    label: "Problems",
    description: "What goes wrong when sales run on a shared WhatsApp phone.",
    fields: [
      ...HEADING_FIELDS,
      { key: "closing", type: "text", label: "Closing statement", max: 90, hint: "The line under the cards." },
    ],
    collections: [
      {
        kind: "card",
        label: "Problem cards",
        itemLabel: "problem",
        titleField: "label",
        max: 6,
        fields: [
          { key: "icon", type: "icon", label: "Icon" },
          { key: "value", type: "text", label: "Value", required: true, max: 16 },
          { key: "label", type: "text", label: "Label", required: true, max: 40 },
          { key: "description", type: "text", label: "Description", max: 90 },
          { key: "meter", type: "number", label: "Meter fill (0–100)", max: 100 },
        ],
      },
    ],
  },

  howItWorks: {
    label: "How It Works",
    description: "The path from a WhatsApp message to a qualified lead.",
    whatsapp: true,
    anchor: "how-it-works",
    fields: HEADING_FIELDS,
    collections: [
      {
        kind: "step",
        label: "Steps",
        itemLabel: "step",
        titleField: "title",
        max: 6,
        fields: [
          { key: "icon", type: "icon", label: "Icon" },
          { key: "title", type: "text", label: "Title", required: true, max: 40 },
          { key: "description", type: "text", label: "Description", max: 120 },
        ],
      },
    ],
  },

  products: {
    label: "Products",
    description: "The platform feature cards.",
    whatsapp: true,
    anchor: "platform",
    fields: [
      ...HEADING_FIELDS,
      { key: "ctaLabel", type: "text", label: "Button label", max: 30 },
      { key: "ctaHref", type: "url", label: "Button link" },
    ],
    collections: [
      {
        kind: "product",
        label: "Product cards",
        itemLabel: "product",
        titleField: "title",
        max: 12,
        fields: [
          { key: "icon", type: "icon", label: "Icon" },
          { key: "title", type: "text", label: "Title", required: true, max: 40 },
          { key: "description", type: "text", label: "Description", max: 110 },
          { key: "ctaLabel", type: "text", label: "Link label", max: 24, hint: "Leave empty to show no link." },
          { key: "ctaHref", type: "url", label: "Link" },
        ],
      },
    ],
  },

  ai: {
    label: "AI",
    description: "The AI spotlight: what the assistant does, and the insight panel beside it.",
    whatsapp: true,
    anchor: "ai",
    fields: [
      ...HEADING_FIELDS,
      { key: "panelTitle", type: "text", label: "Panel title", max: 40, group: "Insight panel" },
      { key: "panelStatus", type: "text", label: "Panel status badge", max: 24, group: "Insight panel" },
      { key: "panelMessage", type: "textarea", label: "Customer message in the panel", max: 160, group: "Insight panel" },
    ],
    collections: [
      {
        kind: "feature",
        label: "AI features",
        itemLabel: "feature",
        titleField: "title",
        max: 6,
        fields: [
          { key: "icon", type: "icon", label: "Icon" },
          { key: "title", type: "text", label: "Title", required: true, max: 40 },
          { key: "description", type: "text", label: "Description", max: 120 },
        ],
      },
      {
        kind: "metric",
        label: "Panel metrics",
        itemLabel: "metric",
        titleField: "label",
        max: 6,
        fields: [
          { key: "label", type: "text", label: "Label", required: true, max: 24 },
          { key: "value", type: "text", label: "Value", required: true, max: 30 },
          { key: "progress", type: "number", label: "Bar (0–100)", max: 100, hint: "0 hides the bar." },
        ],
      },
    ],
  },

  messageTypes: {
    label: "Message Types",
    description: "The WhatsApp message formats the platform can send and receive.",
    whatsapp: true,
    fields: HEADING_FIELDS,
    collections: [
      {
        kind: "type",
        label: "Message types",
        itemLabel: "message type",
        titleField: "label",
        max: 12,
        fields: [
          { key: "icon", type: "icon", label: "Icon" },
          { key: "label", type: "text", label: "Label", required: true, max: 30 },
          { key: "description", type: "text", label: "Description", max: 70 },
        ],
      },
    ],
  },

  integrations: {
    label: "Integrations",
    description: "The tools and channels the platform connects with.",
    fields: HEADING_FIELDS,
    collections: [
      {
        kind: "integration",
        label: "Integrations",
        itemLabel: "integration",
        titleField: "name",
        max: 16,
        fields: [
          { key: "icon", type: "icon", label: "Icon", hint: "Used when there is no logo image." },
          { key: "name", type: "text", label: "Name", required: true, max: 40 },
          { key: "description", type: "text", label: "Description", max: 70 },
          { key: "imageUrl", type: "image", label: "Logo image URL", hint: "Optional." },
          { key: "href", type: "url", label: "Link", hint: "Optional." },
        ],
      },
    ],
  },

  industries: {
    label: "Industries",
    description: "The “who it's for” strip of industry cards. Each card links to its industry page.",
    anchor: "industries",
    fields: [
      ...HEADING_FIELDS,
      { key: "linkLabel", type: "text", label: "Link label", max: 40 },
      { key: "linkHref", type: "url", label: "Link" },
    ],
    collections: [
      {
        kind: "industry",
        label: "Industry cards",
        description: "Pick which industry pages appear, and in what order. The pages themselves are unchanged.",
        itemLabel: "industry",
        titleField: "industryId",
        max: INDUSTRIES.length,
        fields: [
          {
            key: "industryId",
            type: "select",
            label: "Industry",
            options: INDUSTRIES.map((industry) => ({ value: industry.id, label: industry.short })),
          },
          {
            key: "line",
            type: "text",
            label: "Card line",
            max: 90,
            hint: "Optional. Leave empty to use the industry's standard line.",
          },
        ],
      },
    ],
  },

  testimonials: {
    label: "Testimonials",
    description: "Customer quotes. The section is hidden until at least one quote is active.",
    fields: HEADING_FIELDS,
    collections: [
      {
        kind: "testimonial",
        label: "Testimonials",
        description: "Only publish quotes you have permission to use.",
        itemLabel: "testimonial",
        titleField: "name",
        max: 9,
        fields: [
          { key: "quote", type: "textarea", label: "Quote", required: true, max: 320 },
          { key: "name", type: "text", label: "Customer name", required: true, max: 50 },
          { key: "role", type: "text", label: "Role / designation", max: 50 },
          { key: "company", type: "text", label: "Company", max: 60 },
          { key: "avatarUrl", type: "image", label: "Photo URL", hint: "Optional. Initials are shown without it." },
        ],
      },
    ],
  },

  pricing: {
    label: "Pricing",
    description: "Plan cards on the homepage and the /pricing page.",
    anchor: "pricing",
    fields: [
      ...HEADING_FIELDS,
      { key: "currency", type: "text", label: "Currency symbol", required: true, max: 4, group: "Display" },
      { key: "annualDiscountPercent", type: "number", label: "Annual discount (%)", max: 90, group: "Display", hint: "0 hides the monthly / annual switch." },
      { key: "priceNote", type: "text", label: "Price note", max: 60, group: "Display", hint: "Shown under monthly prices, e.g. GST extra." },
      { key: "popularLabel", type: "text", label: "Featured badge text", max: 24, group: "Display" },
      { key: "compareLabel", type: "text", label: "Compare link label", max: 30, group: "Display" },
      { key: "compareHref", type: "url", label: "Compare link", group: "Display" },
    ],
    collections: [
      {
        kind: "plan",
        label: "Plans",
        description: "Marketing copy only — plan limits and billing are managed on the Plans page.",
        itemLabel: "plan",
        titleField: "name",
        max: 4,
        fields: [
          { key: "name", type: "text", label: "Plan name", required: true, max: 30 },
          { key: "subtitle", type: "text", label: "Subtitle", max: 90 },
          { key: "price", type: "number", label: "Monthly price", max: 10_000_000 },
          { key: "period", type: "text", label: "Billing period", max: 16, placeholder: "/month" },
          { key: "features", type: "list", label: "Features", max: 12, hint: "One feature per line." },
          { key: "ctaLabel", type: "text", label: "Button label", required: true, max: 24 },
          { key: "ctaHref", type: "url", label: "Button link", required: true },
          { key: "isPopular", type: "boolean", label: "Featured plan" },
        ],
      },
    ],
  },

  faq: {
    label: "FAQ",
    description: "Frequently asked questions.",
    anchor: "faq",
    fields: HEADING_FIELDS,
    collections: [
      {
        kind: "faq",
        label: "Questions",
        itemLabel: "question",
        titleField: "question",
        max: 20,
        fields: [
          { key: "question", type: "text", label: "Question", required: true, max: 140 },
          { key: "answer", type: "textarea", label: "Answer", required: true, max: 700 },
        ],
      },
    ],
  },

  cta: {
    label: "CTA",
    description: "The closing call to action.",
    fields: [
      { key: "title", type: "text", label: "Heading", required: true, max: 90 },
      { key: "description", type: "text", label: "Description", max: 140 },
      { key: "primaryCtaLabel", type: "text", label: "Primary button label", required: true, max: 30 },
      { key: "primaryCtaHref", type: "url", label: "Primary button link", required: true },
      { key: "secondaryCtaLabel", type: "text", label: "Secondary button label", max: 30, hint: "Leave empty to hide." },
      { key: "secondaryCtaHref", type: "url", label: "Secondary button link" },
    ],
    collections: [],
  },

  newsletter: {
    label: "Newsletter",
    description: "The email sign-up band above the footer.",
    fields: [
      { key: "title", type: "text", label: "Heading", required: true, max: 80 },
      { key: "description", type: "text", label: "Description", max: 160 },
      { key: "placeholder", type: "text", label: "Email placeholder", max: 60 },
      { key: "buttonLabel", type: "text", label: "Button label", required: true, max: 24 },
      { key: "successMessage", type: "text", label: "Success message", max: 120 },
      { key: "privacyNote", type: "text", label: "Privacy note", max: 120 },
    ],
    collections: [],
  },

  footer: {
    label: "Footer",
    description: "Shown on every marketing page: description, link columns and social links.",
    fields: [
      { key: "ctaTitle", type: "text", label: "Banner heading", max: 60, group: "Top banner" },
      { key: "ctaDescription", type: "text", label: "Banner description", max: 120, group: "Top banner" },
      { key: "ctaLabel", type: "text", label: "Banner button label", max: 30, group: "Top banner", hint: "Leave empty to hide the banner." },
      { key: "ctaHref", type: "url", label: "Banner button link", group: "Top banner" },
      { key: "description", type: "textarea", label: "Footer description", max: 240, group: "Brand" },
      { key: "email", type: "text", label: "Support email", max: 80, group: "Brand" },
      { key: "copyright", type: "text", label: "Copyright line", max: 120, group: "Bottom bar" },
      { key: "legalNote", type: "text", label: "Bottom note", max: 120, group: "Bottom bar" },
    ],
    collections: [
      {
        kind: "group",
        label: "Link columns",
        itemLabel: "column",
        titleField: "heading",
        max: 6,
        fields: [
          { key: "heading", type: "text", label: "Column heading", required: true, max: 30 },
          { key: "links", type: "links", label: "Links", max: 12 },
        ],
      },
      {
        kind: "trust",
        label: "Trust points",
        itemLabel: "trust point",
        titleField: "label",
        max: 4,
        fields: [
          { key: "icon", type: "icon", label: "Icon" },
          { key: "label", type: "text", label: "Label", required: true, max: 40 },
        ],
      },
      {
        kind: "social",
        label: "Social links",
        itemLabel: "social link",
        titleField: "platform",
        max: 5,
        fields: [
          { key: "platform", type: "select", label: "Platform", options: SOCIAL_PLATFORMS },
          { key: "href", type: "url", label: "Profile URL", required: true },
        ],
      },
    ],
  },
} as const satisfies Record<string, SectionSpec>;

// ─── Derived types ────────────────────────────────────────────────────────────

export type SectionKey = keyof typeof CMS_SECTIONS;

/** Admin navigation order, which is also the order the sections appear on the page. */
export const CMS_SECTION_KEYS = Object.keys(CMS_SECTIONS) as SectionKey[];

export function isSectionKey(value: string): value is SectionKey {
  return Object.prototype.hasOwnProperty.call(CMS_SECTIONS, value);
}

export function sectionSpec(key: SectionKey): SectionSpec {
  return CMS_SECTIONS[key];
}

type SpecOf<K extends SectionKey> = (typeof CMS_SECTIONS)[K];
type CollectionOf<K extends SectionKey> = SpecOf<K>["collections"][number];

export type SectionContent<K extends SectionKey> = FieldsShape<SpecOf<K>["fields"]>;

type ItemsOf<K extends SectionKey, Extra> = {
  [C in CollectionOf<K> as C extends CollectionSpec ? C["kind"] : never]: (FieldsShape<
    C["fields"]
  > &
    Extra)[];
};

/** A section as the public site renders it: active items only, in order. */
export interface PublicSection<K extends SectionKey> {
  isActive: boolean;
  content: SectionContent<K>;
  items: ItemsOf<K, { id: string }>;
}

/** The shipped content for a section, used until an admin saves their own. */
export interface SectionDefaults<K extends SectionKey> {
  isActive: boolean;
  content: SectionContent<K>;
  items: ItemsOf<K, { isActive?: boolean }>;
}

export type HomeContent = { [K in SectionKey]: PublicSection<K> };
export type HomeDefaults = { [K in SectionKey]: SectionDefaults<K> };
