// ============================================================================
// MODULE : Website CMS — shipped homepage content
// ============================================================================
//
// What the homepage says until an admin saves something else, and what any
// field falls back to when a saved row does not have it. The admin's "Restore
// defaults" button returns a section to exactly this.
//
// EVERY CLAIM HERE IS ONE THE PRODUCT CAN STAND BEHIND. No customer counts, no
// uptime or revenue figures, no logos of companies that have not agreed to it.
// Where a section only works with real proof — testimonials — the shipped items
// are inactive placeholders, so nothing invented reaches the public page and
// the section stays hidden until the client adds and activates a real quote.
//
// The problem cards are the one deliberate exception: their numbers are an
// illustration of an unmanaged inbox, not statistics, and the copy reads that way.

import { HOME_INDUSTRY_IDS } from "@/components/marketing/industries";
import { PLANS } from "@/components/marketing/plans";
import type { HomeDefaults } from "./sections";

export const HOME_DEFAULTS: HomeDefaults = {
  hero: {
    isActive: true,
    content: {
      badge: "AI-powered WhatsApp CRM",
      title: "Turn WhatsApp conversations into",
      highlight: "qualified leads",
      description:
        "WhatsCRM replies to every customer in seconds, qualifies the lead with AI and keeps your pipeline up to date — all from one shared WhatsApp inbox.",
      primaryCtaLabel: "Start free trial",
      primaryCtaHref: "/register",
      secondaryCtaLabel: "See how it works",
      secondaryCtaHref: "#how-it-works",
      trustNote: "Built on the official Meta WhatsApp Business Cloud API",
      chatContactName: "Waboxa",
      chatContactStatus: "Business account",
      chatCustomerMessage: "Hi, I need pricing for 500 units.",
      chatAiLabel: "Waboxa AI",
      chatAiReply: "Happy to help! Here's our latest price list. Which city should we deliver to?",
      chatAttachmentName: "Waboxa-Price-List.pdf",
      chatAttachmentMeta: "1.2 MB · PDF",
      chatTime: "9:41 AM",
      chatEventCtaLabel: "View in CRM",
      chatEventCtaHref: "/features#lead-pipeline",
    },
    items: {
      stat: [
        { value: "Free trial", label: "No credit card required" },
        { value: "1 inbox", label: "For your whole team" },
        { value: "24×7", label: "AI replies on WhatsApp" },
      ],
      event: [
        { icon: "Bot", title: "AI processing", body: "Understanding customer intent", meta: "1.2s" },
        { icon: "Zap", title: "Auto reply sent", body: "Price list shared instantly", meta: "1.5s" },
        { icon: "BadgeCheck", title: "Lead qualified", body: "Budget & requirement captured", meta: "2.3s" },
        { icon: "CircleCheck", title: "CRM updated", body: "Lead added to your pipeline", meta: "" },
      ],
    },
  },

  logos: {
    isActive: true,
    content: { title: "Built for businesses that sell and support on WhatsApp" },
    items: {
      logo: [
        { name: "Retail & D2C", imageUrl: "", href: "" },
        { name: "Real estate", imageUrl: "", href: "" },
        { name: "Education", imageUrl: "", href: "" },
        { name: "Healthcare", imageUrl: "", href: "" },
        { name: "Travel", imageUrl: "", href: "" },
        { name: "Financial services", imageUrl: "", href: "" },
      ],
    },
  },

  stats: {
    isActive: true,
    content: { title: "" },
    items: {
      stat: [
        { value: "24×7", label: "Always-on replies", description: "The AI answers even when your team is offline." },
        { value: "0–100", label: "Lead score", description: "Every conversation scored on budget, need and timeline." },
        { value: "9", label: "WhatsApp message types", description: "Text, media, documents, location, buttons and more." },
        { value: "5", label: "Team roles", description: "Owners, admins, managers, agents and marketers." },
      ],
    },
  },

  problem: {
    isActive: true,
    content: {
      eyebrow: "The problem",
      title: "WhatsApp is where your leads are — and where they slip away",
      description:
        "When sales run on a shared phone, speed, context and ownership are the first things to go.",
      closing: "WhatsCRM fixes all four — automatically.",
    },
    items: {
      card: [
        {
          icon: "AlarmClock",
          value: "4h+",
          label: "Slow first reply",
          description: "Buyers message three businesses and choose whoever answers first.",
          meter: 86,
        },
        {
          icon: "Target",
          value: "Missed",
          label: "Buying intent",
          description: "“500 units” sits unread in a busy chat, and nobody follows up.",
          meter: 100,
        },
        {
          icon: "UserX",
          value: "Unknown",
          label: "Lead status",
          description: "Hot and cold chats look identical until someone reads them.",
          meter: 18,
        },
        {
          icon: "Users",
          value: "No owner",
          label: "Team handoffs",
          description: "One number, several phones, and no one sure who replied.",
          meter: 55,
        },
      ],
    },
  },

  howItWorks: {
    isActive: true,
    content: {
      eyebrow: "How it works",
      title: "From first message to qualified lead — automatically",
      description:
        "Every WhatsApp conversation follows the same path. Your team steps in only when a lead is ready.",
    },
    items: {
      step: [
        { icon: "MessageSquare", title: "Customer messages you", description: "The chat lands in your shared inbox and becomes a contact." },
        { icon: "Brain", title: "AI understands and replies", description: "Answers in seconds using your documents, FAQs and instructions." },
        { icon: "Target", title: "Lead gets qualified", description: "Budget, need and timeline are captured and scored 0–100." },
        { icon: "Users", title: "Your team takes over", description: "Ready leads go to the right agent with the full conversation." },
        { icon: "TrendingUp", title: "Pipeline stays current", description: "Stages and follow-ups update without manual data entry." },
      ],
    },
  },

  products: {
    isActive: true,
    content: {
      eyebrow: "Platform",
      title: "Everything your team needs to sell on WhatsApp",
      description: "One workspace for conversations, automation, campaigns and reporting.",
      ctaLabel: "Explore all features",
      ctaHref: "/features",
    },
    items: {
      product: [
        {
          icon: "MessageSquare",
          title: "Shared inbox",
          description: "One WhatsApp number for your whole team, with clear ownership of every chat.",
          ctaLabel: "Learn more",
          ctaHref: "/features#shared-inbox",
        },
        {
          icon: "Sparkles",
          title: "AI auto-reply",
          description: "Instant answers grounded in your own documents and FAQs.",
          ctaLabel: "Learn more",
          ctaHref: "/features#ai-auto-reply",
        },
        {
          icon: "TrendingUp",
          title: "Lead pipeline",
          description: "A visual CRM where every chat becomes a scored, trackable lead.",
          ctaLabel: "Learn more",
          ctaHref: "/features#lead-pipeline",
        },
        {
          icon: "Workflow",
          title: "Chatbot flows",
          description: "Build menus and automations on a drag-and-drop canvas — no code.",
          ctaLabel: "",
          ctaHref: "",
        },
        {
          icon: "Megaphone",
          title: "Campaigns & templates",
          description: "Broadcast approved templates to a segment and track every recipient.",
          ctaLabel: "Learn more",
          ctaHref: "/features#campaigns",
        },
        {
          icon: "BookOpen",
          title: "Knowledge base",
          description: "Upload PDFs and documents once; the AI uses them in every reply.",
          ctaLabel: "Learn more",
          ctaHref: "/features#knowledge-base",
        },
        {
          icon: "BarChart3",
          title: "Analytics",
          description: "Response times, lead sources and conversion in one dashboard.",
          ctaLabel: "Learn more",
          ctaHref: "/features#analytics",
        },
        {
          icon: "Ticket",
          title: "Support tickets",
          description: "Turn any conversation into a ticket with a priority and status.",
          ctaLabel: "",
          ctaHref: "",
        },
      ],
    },
  },

  ai: {
    isActive: true,
    content: {
      eyebrow: "AI spotlight",
      title: "An AI assistant that knows your business",
      description:
        "It learns from your documents and instructions, replies like your best agent, and flags the moment a human should step in.",
      panelTitle: "Conversation insights",
      panelStatus: "AI active",
      panelMessage: "Hi, we need 500 units delivered to Pune next month. What's your best price?",
    },
    items: {
      feature: [
        { icon: "BookOpen", title: "Answers from your documents", description: "Replies are grounded in your knowledge base, not guesswork." },
        { icon: "Target", title: "Automatic lead scoring", description: "Reads each chat for budget, need and timeline, then scores it 0–100." },
        { icon: "ListChecks", title: "Rules it always follows", description: "Set the tone, language and instructions every reply must respect." },
        { icon: "UserCheck", title: "Human handoff", description: "Buying signals are flagged so your team steps in at the right time." },
      ],
      metric: [
        { label: "Intent", value: "Pricing enquiry", progress: 0 },
        { label: "Lead score", value: "85 / 100", progress: 85 },
        { label: "Budget", value: "Confirmed", progress: 0 },
        { label: "Timeline", value: "Next month", progress: 0 },
        { label: "Next step", value: "Assign to sales", progress: 0 },
      ],
    },
  },

  messageTypes: {
    isActive: true,
    content: {
      eyebrow: "Rich messaging",
      title: "Send more than text",
      description: "Use every WhatsApp format your customers already know — from voice notes to tap-to-reply buttons.",
    },
    items: {
      type: [
        { icon: "Type", label: "Text", description: "Replies and saved quick responses" },
        { icon: "Image", label: "Images", description: "Product photos and catalogues" },
        { icon: "Video", label: "Video", description: "Demos and walkthroughs" },
        { icon: "FileText", label: "Documents", description: "Price lists, invoices and brochures" },
        { icon: "Mic", label: "Voice & audio", description: "Voice notes from customers" },
        { icon: "MapPin", label: "Location", description: "Store and delivery locations" },
        { icon: "MousePointerClick", label: "Buttons", description: "Tap-to-reply interactive buttons" },
        { icon: "List", label: "List menus", description: "Let customers pick from options" },
        { icon: "LayoutTemplate", label: "Templates", description: "Meta-approved broadcast messages" },
      ],
    },
  },

  integrations: {
    isActive: true,
    content: {
      eyebrow: "Integrations",
      title: "Works with the tools you already use",
      description: "Connect WhatsApp, bring in your data and plug WhatsCRM into the rest of your stack.",
    },
    items: {
      integration: [
        { icon: "MessageCircle", name: "WhatsApp Cloud API", description: "Official Meta Business Platform connection", imageUrl: "", href: "" },
        { icon: "Code2", name: "WhatsCRM API", description: "Send messages, sync contacts and leads", imageUrl: "", href: "/api-docs" },
        { icon: "Webhook", name: "Webhooks", description: "Receive conversation events in real time", imageUrl: "", href: "/api-docs#webhooks" },
        { icon: "FileSpreadsheet", name: "Excel & CSV import", description: "Bring in contacts and leads in bulk", imageUrl: "", href: "" },
        { icon: "FileText", name: "PDF & Word documents", description: "Train the AI on your own files", imageUrl: "", href: "" },
        { icon: "Bell", name: "Live updates", description: "New messages appear instantly for the team", imageUrl: "", href: "" },
      ],
    },
  },

  industries: {
    isActive: true,
    content: {
      eyebrow: "Who it's for",
      title: "Built for the way you sell",
      description: "See how businesses like yours sell and support customers on WhatsApp.",
      linkLabel: "See how each industry uses it",
      linkHref: "/industries",
    },
    items: {
      industry: HOME_INDUSTRY_IDS.map((industryId) => ({ industryId, line: "" })),
    },
  },

  testimonials: {
    isActive: true,
    content: {
      eyebrow: "Customers",
      title: "What teams say about WhatsCRM",
      description: "Businesses running sales and support on WhatsApp.",
    },
    items: {
      testimonial: [1, 2, 3].map(() => ({
        isActive: false,
        quote:
          "Replace with a short quote from a real customer — what changed after they moved their WhatsApp sales to WhatsCRM.",
        name: "Customer name",
        role: "Role",
        company: "Company",
        avatarUrl: "",
      })),
    },
  },

  pricing: {
    isActive: true,
    content: {
      eyebrow: "Pricing",
      title: "Simple plans that grow with your inbox",
      description: "Start with a free trial. Upgrade when your team and message volume grow.",
      currency: "₹",
      annualDiscountPercent: 20,
      priceNote: "Billed monthly · GST extra",
      popularLabel: "Most popular",
      compareLabel: "Compare all plans",
      compareHref: "/pricing",
    },
    items: {
      plan: PLANS.map((plan) => ({
        name: plan.name,
        subtitle: plan.tagline,
        price: plan.monthlyPrice,
        period: "/month",
        features: plan.features,
        ctaLabel: plan.cta,
        ctaHref: plan.id === "ENTERPRISE" ? "/contact" : `/register?plan=${plan.id}`,
        isPopular: plan.isPopular,
      })),
    },
  },

  faq: {
    isActive: true,
    content: { eyebrow: "FAQ", title: "Questions, answered", description: "" },
    items: {
      faq: [
        {
          question: "What is WhatsCRM?",
          answer:
            "An AI-powered CRM for your WhatsApp Business number. Incoming chats become contacts and leads automatically, the AI replies and qualifies them, and your team works everything from one shared inbox and pipeline.",
        },
        {
          question: "Can I connect my own WhatsApp number?",
          answer:
            "Yes. WhatsCRM runs on the official Meta WhatsApp Business Cloud API. You need a Meta Business Account with WhatsApp enabled, and the setup wizard walks you through connecting it.",
        },
        {
          question: "How does the AI qualify leads?",
          answer:
            "It reads each conversation for budget, authority, need and timeline, and turns what it finds into a score from 0 to 100 — so your team knows which chats to pick up first.",
        },
        {
          question: "Where do the AI's answers come from?",
          answer:
            "From the documents and FAQs you add to your knowledge base. The AI looks up the relevant passages before it replies, so answers stay accurate and on-brand.",
        },
        {
          question: "Can my whole team use one number?",
          answer:
            "Yes. Everyone works from the same shared inbox, with conversations assigned to agents and role-based access for owners, managers and agents.",
        },
        {
          question: "How does the free trial work?",
          answer:
            "Create a workspace and try the WhatsApp, CRM and AI features without a credit card. Paid plans are billed monthly or annually and can be changed or cancelled from Billing at any time.",
        },
      ],
    },
  },

  cta: {
    isActive: true,
    content: {
      title: "Ready to turn WhatsApp chats into qualified leads?",
      description: "Start your free trial today — no credit card required.",
      primaryCtaLabel: "Start free trial",
      primaryCtaHref: "/register",
      secondaryCtaLabel: "Talk to sales",
      secondaryCtaHref: "/contact",
    },
    items: {},
  },

  newsletter: {
    isActive: true,
    content: {
      title: "Get WhatsApp growth tips",
      description: "Practical ideas on automation, lead qualification and selling on WhatsApp — sent to your inbox.",
      placeholder: "you@company.com",
      buttonLabel: "Subscribe",
      successMessage: "Thanks for subscribing — you're on the list.",
      privacyNote: "We only use your email to send product updates and tips.",
    },
    items: {},
  },

  footer: {
    isActive: true,
    content: {
      ctaTitle: "Ready to grow on WhatsApp?",
      ctaDescription: "Connect your number and let the AI handle the first reply.",
      ctaLabel: "Start free trial",
      ctaHref: "/register",
      description:
        "An AI-powered WhatsApp CRM: one shared inbox, replies grounded in your own documents, and leads qualified automatically.",
      email: "support@whatscrm.in",
      copyright: "© WhatsCRM by Corescent Technologies Pvt Ltd. All rights reserved.",
      legalNote: "Built on the official Meta WhatsApp Business Cloud API.",
    },
    items: {
      group: [
        {
          heading: "Company",
          links: [
            { label: "About Us", href: "/about", isActive: true },
            { label: "Why Choose Us", href: "/why-choose-us", isActive: true },
            { label: "Career", href: "/careers", isActive: true },
            { label: "Blog", href: "/blog", isActive: true },
            { label: "Become a Partner", href: "/become-a-partner", isActive: true },
          ],
        },
        {
          heading: "Product",
          links: [
            { label: "Features", href: "/features", isActive: true },
            { label: "Solutions", href: "/solutions", isActive: true },
            { label: "Industry", href: "/industries", isActive: true },
            { label: "Pricing", href: "/pricing", isActive: true },
            { label: "Portfolio", href: "/portfolio", isActive: true },
            { label: "Resources", href: "/resources", isActive: true },
          ],
        },
        {
          heading: "Developer",
          links: [
            { label: "Documentation", href: "/documentation", isActive: true },
            { label: "WhatsCRM API", href: "/api-docs", isActive: true },
            { label: "Site Map", href: "/site-map", isActive: true },
            { label: "Contact", href: "/contact", isActive: true },
          ],
        },
        {
          heading: "Legal",
          links: [
            { label: "Privacy Policy", href: "/privacy-policy", isActive: true },
            { label: "Terms & Conditions", href: "/terms", isActive: true },
            { label: "Refund Policy", href: "/refund-policy", isActive: true },
            { label: "Cookies", href: "/cookies", isActive: true },
            // Kept, switched off: the page exists, but it is not in the client's legal list.
            { label: "Security", href: "/security", isActive: false },
          ],
        },
      ],
      trust: [
        { icon: "ShieldCheck", label: "Official Meta Cloud API" },
        { icon: "Sparkles", label: "AI grounded in your docs" },
        { icon: "Zap", label: "Free trial, no card" },
      ],
      social: [
        { platform: "twitter", href: "https://twitter.com" },
        { platform: "linkedin", href: "https://linkedin.com" },
        { platform: "facebook", href: "https://facebook.com" },
        { platform: "instagram", href: "https://instagram.com" },
        { platform: "youtube", href: "https://youtube.com" },
      ],
    },
  },
};
