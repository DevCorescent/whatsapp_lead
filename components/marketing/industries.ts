import {
  BarChart3,
  BadgeCheck,
  Bell,
  BookOpen,
  Bot,
  Briefcase,
  Building2,
  CalendarClock,
  Car,
  FileCheck2,
  GraduationCap,
  HeartPulse,
  Landmark,
  Megaphone,
  MessageSquare,
  Route,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Target,
  Truck,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

/**
 * The industries, in one place.
 *
 * THREE VIEWS OF ONE LIST rather than three lists that drift apart:
 *
 *   • the homepage carousel reads `short` and `line`, for the six in `HOME_INDUSTRY_IDS`
 *   • /industries reads `short`, `problem` and `solution` on a compact card
 *   • /industries/[industry] reads everything below `summary` — the problems, the flow,
 *     the sample conversation, the capabilities and the outcomes
 *
 * A renamed industry or a changed claim therefore has exactly one place to be changed,
 * and `id` is simultaneously the route segment, the anchor on the listing page and the
 * React key. Nothing is authored twice.
 *
 * `short` exists because the surfaces have different room: "EdTech & Coaching" is the
 * right label on a page about it and too long for a card in a moving strip.
 *
 * WHY THE DETAIL IS DATA AND NOT EIGHT PAGES. Every industry page makes the same
 * argument — this is what breaks on WhatsApp, this is what the AI does about it, this
 * is what you get — and eight hand-written pages of one argument diverge inside a
 * month. One template plus eight rows of content means a change to the argument is a
 * change to the template, and a change to an industry is a change to its row.
 */

/** Accent tints. Deliberately small, and only ever used on an icon tile or a wash. */
export type AccentKey =
  | "emerald"
  | "teal"
  | "sky"
  | "cyan"
  | "indigo"
  | "violet"
  | "amber"
  | "rose";

/**
 * The accent, resolved to class strings.
 *
 * Written as whole literal class names rather than composed from the key, because
 * Tailwind's scanner only sees classes that appear literally in the source — a
 * `bg-${accent}-50` compiles to nothing at all.
 *
 * The accent is the ONE thing allowed to differ between industry pages, and it appears
 * in exactly three places: the icon tile, one hero wash and the column rule. The CTAs,
 * the chat, the flow rail and the dark close stay brand green on all eight pages, so
 * the set still reads as one product.
 */
export const ACCENT_STYLE: Record<
  AccentKey,
  { tile: string; icon: string; glow: string; rule: string }
> = {
  emerald: {
    tile: "bg-emerald-50 ring-emerald-600/15",
    icon: "text-emerald-600",
    glow: "bg-[radial-gradient(closest-side,rgba(16,185,129,0.18),transparent_100%)]",
    rule: "from-emerald-400/70",
  },
  teal: {
    tile: "bg-teal-50 ring-teal-600/15",
    icon: "text-teal-600",
    glow: "bg-[radial-gradient(closest-side,rgba(45,212,191,0.20),transparent_100%)]",
    rule: "from-teal-400/70",
  },
  sky: {
    tile: "bg-sky-50 ring-sky-600/15",
    icon: "text-sky-600",
    glow: "bg-[radial-gradient(closest-side,rgba(56,189,248,0.18),transparent_100%)]",
    rule: "from-sky-400/70",
  },
  cyan: {
    tile: "bg-cyan-50 ring-cyan-600/15",
    icon: "text-cyan-600",
    glow: "bg-[radial-gradient(closest-side,rgba(34,211,238,0.18),transparent_100%)]",
    rule: "from-cyan-400/70",
  },
  indigo: {
    tile: "bg-indigo-50 ring-indigo-600/15",
    icon: "text-indigo-600",
    glow: "bg-[radial-gradient(closest-side,rgba(129,140,248,0.16),transparent_100%)]",
    rule: "from-indigo-400/70",
  },
  violet: {
    tile: "bg-violet-50 ring-violet-600/15",
    icon: "text-violet-600",
    glow: "bg-[radial-gradient(closest-side,rgba(167,139,250,0.16),transparent_100%)]",
    rule: "from-violet-400/70",
  },
  amber: {
    tile: "bg-amber-50 ring-amber-600/15",
    icon: "text-amber-600",
    glow: "bg-[radial-gradient(closest-side,rgba(251,191,36,0.16),transparent_100%)]",
    rule: "from-amber-400/70",
  },
  rose: {
    tile: "bg-rose-50 ring-rose-600/15",
    icon: "text-rose-600",
    glow: "bg-[radial-gradient(closest-side,rgba(251,113,133,0.16),transparent_100%)]",
    rule: "from-rose-400/70",
  },
};

/** One beat of the industry's automation, for the four-step rail on the detail page. */
export type FlowStep = {
  label: string;
  detail: string;
};

/** The sample WhatsApp exchange each industry page plays. */
export type IndustryChat = {
  /** Who is writing in — a plausible contact for the sector. */
  contact: string;
  initials: string;
  /** The customer's opening message. */
  incoming: string;
  /** What the AI sends back, grounded in the business's own documents. */
  reply: string;
  /** The document the answer was drawn from. */
  source: string;
  /** What the AI extracted from the exchange, as label/value chips. */
  captured: { label: string; value: string }[];
  /** Where the lead lands in the pipeline afterwards. */
  stage: string;
  /** Who picks it up. */
  owner: string;
};

export type Industry = {
  id: string;
  Icon: LucideIcon;
  accent: AccentKey;
  /** Full name, for the detail page and the site map. */
  name: string;
  /** Card label, for the homepage carousel and the listing grid. */
  short: string;
  /** Homepage: the one line on the card — a pain or the relief from it. */
  line: string;
  /** Listing card: the pain, in under ten words. */
  problem: string;
  /** Listing card: what WhatsCRM does about it, in under twelve words. */
  solution: string;
  /** The long form, used on the detail page's hero. */
  summary: string;
  /** Three bullets, on the listing card and on the detail page. */
  useCases: string[];
  /** Detail page: the H1. */
  heroTitle: string;
  /** Detail page: three things that go wrong today. */
  problems: { title: string; body: string }[];
  /** Detail page: enquiry → understanding → reply → outcome. Always four. */
  flow: FlowStep[];
  /** Detail page: the conversation, played. */
  chat: IndustryChat;
  /** Detail page: five things the workspace does for this sector. */
  capabilities: { Icon: LucideIcon; title: string; body: string }[];
  /** Detail page: what the business gets. Mechanisms, not invented adoption figures. */
  outcomes: { title: string; body: string }[];
};

export const INDUSTRIES: Industry[] = [
  {
    id: "retail",
    Icon: ShoppingBag,
    accent: "amber",
    name: "Retail",
    short: "Retail",
    line: "Customer queries answered instantly.",
    problem: "Stock and timing questions pile up unanswered.",
    solution: "AI answers from your catalogue and keeps the buyers worth calling.",
    summary:
      "Shoppers ask about stock, sizes and store timings on WhatsApp and expect an answer now. WhatsCRM answers from your own catalogue and keeps the ones worth following up.",
    useCases: [
      "Stock, size and price questions answered instantly",
      "Store timings and location on autopilot",
      "Festive and new-arrival broadcasts to past buyers",
    ],
    heroTitle: "Answer every shopper in seconds, not the next working day",
    problems: [
      {
        title: "The same five questions, all day",
        body: "Is it in stock, what size, what price, are you open, where are you. Staff on the floor cannot answer a customer and a chat at once.",
      },
      {
        title: "Enquiries die after closing time",
        body: "A large share of retail messages land outside store hours, and a shopper who has to wait until morning has usually bought elsewhere.",
      },
      {
        title: "Nobody knows who asked what",
        body: "Chats live on one staff member's phone, so a returning customer starts from scratch and past buyers are never contacted again.",
      },
    ],
    flow: [
      {
        label: "Shopper messages",
        detail: "A question about stock, a size or your timings arrives on your business number.",
      },
      {
        label: "AI reads the catalogue",
        detail: "The answer is drawn from the price list and stock sheet you uploaded, not invented.",
      },
      {
        label: "AI replies instantly",
        detail: "Availability, price and store timings answered in seconds, at any hour.",
      },
      {
        label: "Buyer saved to CRM",
        detail: "The contact, the product they asked about and their interest level are recorded for the next campaign.",
      },
    ],
    chat: {
      contact: "Ananya Sharma",
      initials: "AS",
      incoming: "Do you have the tan leather jacket in medium? And what time do you close today?",
      reply:
        "Yes — the tan leather jacket is in stock in M at ₹6,499. We're open until 9pm today at the Koramangala store.",
      source: "Autumn-Catalogue-and-Stock.pdf",
      captured: [
        { label: "Product", value: "Leather jacket · M" },
        { label: "Intent", value: "Ready to visit" },
        { label: "Store", value: "Koramangala" },
      ],
      stage: "Store visit",
      owner: "Floor team",
    },
    capabilities: [
      {
        Icon: Bot,
        title: "Catalogue-grounded replies",
        body: "Upload the price list and stock sheet once. The AI answers availability, size and price from it, and says it will check when it does not know.",
      },
      {
        Icon: Target,
        title: "Buyer intent scoring",
        body: "A shopper asking about a specific size is closer to buying than one asking your address. WhatsCRM scores the difference so staff call the right one.",
      },
      {
        Icon: Bell,
        title: "Visit and hold reminders",
        body: "An item held for a customer triggers a follow-up before it goes back on the shelf, with nobody having to remember.",
      },
      {
        Icon: Megaphone,
        title: "Festive and new-arrival broadcasts",
        body: "Segment past buyers by what they bought and send an approved template campaign to that list, not to everyone.",
      },
      {
        Icon: BarChart3,
        title: "What people actually ask",
        body: "The most-asked questions and the products behind them, so you know what to stock and what to put on the shelf by the door.",
      },
    ],
    outcomes: [
      {
        title: "Replies at 11pm",
        body: "The AI answers outside store hours, which is when a large share of retail enquiries arrive.",
      },
      {
        title: "Staff on the floor",
        body: "Routine questions never reach a person, so your team serves the customers standing in front of them.",
      },
      {
        title: "A list worth broadcasting to",
        body: "Every enquiry becomes a contact with a product against it — the raw material for the next campaign.",
      },
    ],
  },
  {
    id: "real-estate",
    Icon: Building2,
    accent: "sky",
    name: "Real Estate",
    short: "Real Estate",
    line: "Enquiries go cold in a group chat.",
    problem: "Property enquiries go cold in a group chat.",
    solution: "AI qualifies budget, location and timeline, then assigns the agent.",
    summary:
      "Property enquiries arrive on WhatsApp and go cold in a group chat. WhatsCRM captures every one and tells you which buyer is actually ready to visit.",
    useCases: [
      "Auto-reply with floor plans, price and location",
      "AI scores buyers on budget and timeline",
      "Site-visit follow-ups that never get forgotten",
    ],
    heroTitle: "Know which enquiry is a buyer before you pick up the phone",
    problems: [
      {
        title: "Portal leads arrive faster than anyone can call",
        body: "A listing enquiry is worth the most in its first ten minutes. By the time an agent gets to it, three other brokers have already replied.",
      },
      {
        title: "Every enquiry looks identical",
        body: "\"Details please\" tells you nothing about budget, possession timeline or whether they are buying at all. Agents burn a day finding out.",
      },
      {
        title: "Site-visit follow-ups vanish",
        body: "The visit is booked in a chat and remembered by one person. Nobody owns the follow-up, so the deal cools in the gap.",
      },
    ],
    flow: [
      {
        label: "Enquiry arrives",
        detail: "A buyer asks about a listing from a portal, an ad or a hoarding number.",
      },
      {
        label: "AI reads the requirement",
        detail: "Budget, preferred location, configuration and possession timeline are pulled out of what they wrote.",
      },
      {
        label: "AI replies with the details",
        detail: "Price, carpet area, floor plan and location answered instantly from your project brochure.",
      },
      {
        label: "Agent gets a scored lead",
        detail: "The buyer is scored, routed to the right agent, and a site-visit follow-up is scheduled.",
      },
    ],
    chat: {
      contact: "Rohit Mehta",
      initials: "RM",
      incoming:
        "Interested in the 3BHK in Whitefield. What's the price, and is it ready to move in? Budget around 1.4Cr.",
      reply:
        "The 3BHK at Whitefield is ₹1.38Cr all-in, 1,640 sq ft carpet, ready to move with OC received. I can hold a site-visit slot this weekend — Saturday or Sunday?",
      source: "Whitefield-Project-Brochure.pdf",
      captured: [
        { label: "Budget", value: "₹1.4Cr" },
        { label: "Config", value: "3BHK" },
        { label: "Timeline", value: "Ready to move" },
      ],
      stage: "Site visit",
      owner: "Priya S.",
    },
    capabilities: [
      {
        Icon: Bot,
        title: "Instant reply with the real numbers",
        body: "Price, carpet area, floor plan, possession date and location — answered from the brochure you uploaded, the moment the enquiry lands.",
      },
      {
        Icon: Target,
        title: "Budget and timeline qualification",
        body: "The AI asks for what is missing and scores the buyer on budget fit, configuration and how soon they intend to move.",
      },
      {
        Icon: Route,
        title: "Routing by project and location",
        body: "A Whitefield enquiry goes to the Whitefield agent. Assignment is a rule, not a message in a group nobody reads.",
      },
      {
        Icon: CalendarClock,
        title: "Site-visit follow-ups",
        body: "Book the visit in the chat and the reminder, the confirmation and the after-visit nudge are all scheduled from it.",
      },
      {
        Icon: Workflow,
        title: "A pipeline per project",
        body: "Enquiry, qualified, site visit, negotiation, booked — with the whole conversation attached to the lead at every stage.",
      },
    ],
    outcomes: [
      {
        title: "First reply in seconds",
        body: "The first broker to answer usually gets the visit. The AI is answering before anyone has opened the app.",
      },
      {
        title: "Agents call qualified buyers",
        body: "Budget, configuration and timeline are known before the call, so the call is about the property.",
      },
      {
        title: "No enquiry left in a group",
        body: "Every enquiry is a lead record with an owner and a next step, not a message someone scrolled past.",
      },
    ],
  },
  {
    id: "education",
    Icon: GraduationCap,
    accent: "violet",
    name: "EdTech & Coaching",
    short: "Education",
    line: "The same questions. Every time.",
    problem: "Admission season buries counsellors in the same questions.",
    solution: "AI answers fees, batches and syllabus; counsellors call serious students.",
    summary:
      "Admission season means hundreds of the same questions. Let AI answer fees, batches and syllabus while your counsellors call the serious students.",
    useCases: [
      "Instant answers on fees, batches and EMI",
      "Counsellor assignment by course interest",
      "Bulk campaigns for new batch launches",
    ],
    heroTitle: "Let counsellors counsel, and let the AI answer the fee question",
    problems: [
      {
        title: "Admission season is one long FAQ",
        body: "Fees, batch timings, syllabus, EMI, hostel, placement. The same ten questions, hundreds of times, from parents and students at once.",
      },
      {
        title: "Counsellors spend the season on browsers",
        body: "Without knowing the course, the budget or the intake, every enquiry gets the same call — and a student who was ready gets the same twenty minutes as one who was only looking.",
      },
      {
        title: "Enquiries and admissions live apart",
        body: "Chats on a counsellor's phone, applications in a spreadsheet. When the counsellor is on leave, so is the pipeline.",
      },
    ],
    flow: [
      {
        label: "Student or parent enquires",
        detail: "A question about a course, the fee or the next batch arrives on your admissions number.",
      },
      {
        label: "AI reads the prospectus",
        detail: "Only approved course information is used — fees, duration, eligibility, batch dates, EMI.",
      },
      {
        label: "AI replies and asks what is missing",
        detail: "Course of interest, current class or qualification, city and preferred batch are captured in the conversation.",
      },
      {
        label: "Counsellor picks up a warm lead",
        detail: "The enquiry is scored, assigned by course, and a follow-up is scheduled before the intake closes.",
      },
    ],
    chat: {
      contact: "Meera Iyer",
      initials: "MI",
      incoming:
        "My daughter is in class 12. What's the fee for the NEET repeater batch, and when does it start?",
      reply:
        "The NEET repeater batch starts 12 June, runs 11 months, and the fee is ₹1,45,000 — payable in 3 instalments. Class 12 pass is the only eligibility. Shall I book a counselling call?",
      source: "Prospectus-2026-Fees-and-Batches.pdf",
      captured: [
        { label: "Course", value: "NEET repeater" },
        { label: "Stage", value: "Class 12" },
        { label: "Intake", value: "June batch" },
      ],
      stage: "Counselling booked",
      owner: "Admissions desk",
    },
    capabilities: [
      {
        Icon: BookOpen,
        title: "Only approved course information",
        body: "The AI answers from the prospectus and fee circular you upload. It cannot invent a discount or a batch date that does not exist.",
      },
      {
        Icon: Target,
        title: "Admission-lead qualification",
        body: "Course interest, current class or qualification, city and intake — captured in the chat and scored, so counsellors know who to call first.",
      },
      {
        Icon: Route,
        title: "Assignment by course",
        body: "A NEET enquiry reaches the NEET counsellor, an MBA enquiry the MBA one. Routing is a rule you set once.",
      },
      {
        Icon: CalendarClock,
        title: "Follow-ups through the intake",
        body: "Counselling call, document submission, fee deadline — each scheduled from the conversation and chased automatically.",
      },
      {
        Icon: Megaphone,
        title: "Batch-launch campaigns",
        body: "Broadcast a new batch to the segment that asked about that course last season, using approved templates.",
      },
    ],
    outcomes: [
      {
        title: "The FAQ answers itself",
        body: "Fees, batches, syllabus and EMI handled by AI at 10pm on a Sunday, which is when parents ask.",
      },
      {
        title: "Counsellor time goes to intent",
        body: "Calls start with the course, the class and the intake already known.",
      },
      {
        title: "Nothing lost between intakes",
        body: "An enquiry that was not ready this season is a contact you can broadcast to next season.",
      },
    ],
  },
  {
    id: "healthcare",
    Icon: HeartPulse,
    accent: "teal",
    name: "Healthcare & Clinics",
    short: "Healthcare",
    line: "Patients ask, staff gets busy.",
    problem: "The front desk cannot answer chats and patients at once.",
    solution: "AI handles timings, fees and booking; the desk handles the room.",
    summary:
      "Appointment requests, reports and reminders in one shared inbox your front desk can actually keep up with.",
    useCases: [
      "Appointment booking and reminder messages",
      "Answer clinic timings and consultation fees",
      "Route enquiries to the right department",
    ],
    heroTitle: "A front desk that answers WhatsApp without leaving the front desk",
    problems: [
      {
        title: "Reception cannot be in two places",
        body: "Patients in the waiting room and messages on the clinic number arrive at the same time, and the messages lose.",
      },
      {
        title: "Appointment requests take three exchanges",
        body: "Which doctor, which day, what fee. Three messages each way, multiplied by every patient, on a phone one person owns.",
      },
      {
        title: "No-shows nobody chased",
        body: "A booked slot with no reminder is a slot that goes empty, and there is no time in the day to send reminders by hand.",
      },
    ],
    flow: [
      {
        label: "Patient messages the clinic",
        detail: "An appointment request, a fee question or an enquiry about a service arrives.",
      },
      {
        label: "AI reads the clinic's information",
        detail: "Doctor availability, consultation fees, timings and services, from the sheet you uploaded.",
      },
      {
        label: "AI replies and offers a slot",
        detail: "The patient gets the answer and the next available slots without waiting for reception.",
      },
      {
        label: "Routed and reminded",
        detail: "The enquiry goes to the right department, and the appointment reminder is scheduled automatically.",
      },
    ],
    chat: {
      contact: "Sanjay Kulkarni",
      initials: "SK",
      incoming:
        "Is Dr. Rao available this week for a cardiology consult? And what's the consultation fee?",
      reply:
        "Dr. Rao consults Tue and Thu, 10am–1pm. Consultation is ₹900, and reports from the last 6 months help. Nearest slots are Tue 11:20am and Thu 10:40am — shall I hold one?",
      source: "Clinic-Timings-and-Fees.pdf",
      captured: [
        { label: "Department", value: "Cardiology" },
        { label: "Doctor", value: "Dr. Rao" },
        { label: "Intent", value: "Book this week" },
      ],
      stage: "Appointment requested",
      owner: "Front desk",
    },
    capabilities: [
      {
        Icon: MessageSquare,
        title: "One number, the whole desk",
        body: "The clinic number stops living on one phone. Everyone at reception sees the same threads, with a note of who is handling which.",
      },
      {
        Icon: Bot,
        title: "Timings, fees and services answered",
        body: "Grounded in your own schedule and fee sheet — and handed to a human the moment a question is clinical rather than administrative.",
      },
      {
        Icon: Route,
        title: "Department routing",
        body: "Dental to dental, diagnostics to diagnostics. The enquiry reaches the desk that can act on it instead of a general queue.",
      },
      {
        Icon: Bell,
        title: "Appointment reminders",
        body: "A reminder before the slot and a follow-up after it, both scheduled from the conversation — fewer empty chairs, no manual chasing.",
      },
      {
        Icon: ShieldCheck,
        title: "Clinical questions escalate",
        body: "Symptoms, dosage or anything the AI is unsure of stops automation and flags a human. The AI answers admin, never advice.",
      },
    ],
    outcomes: [
      {
        title: "Reception gets its day back",
        body: "Timings, fees and slot questions are handled before a person is involved.",
      },
      {
        title: "Fewer empty slots",
        body: "Every booking carries its own reminder, so no-shows stop being a cost of doing business.",
      },
      {
        title: "One patient history",
        body: "Every message from a patient sits on one contact record instead of on somebody's phone.",
      },
    ],
  },
  {
    id: "services",
    Icon: Briefcase,
    accent: "indigo",
    name: "Professional Services",
    short: "Services",
    line: "Leads come in, follow-ups don't.",
    problem: "Work is won in the chat and lost in the follow-up.",
    solution: "Every enquiry becomes a pipeline record with an owner and a next step.",
    summary:
      "Agencies, consultants and local service businesses win work in the chat and lose it in the follow-up. WhatsCRM keeps every enquiry in a pipeline with an owner.",
    useCases: [
      "Scope and rate questions answered from your docs",
      "Enquiries assigned to the right person automatically",
      "Follow-ups scheduled from the conversation",
    ],
    heroTitle: "Win the work you already won the conversation for",
    problems: [
      {
        title: "The enquiry arrives while you are delivering",
        body: "Small teams are billable all day. A message that lands mid-project gets a reply two days later, which is one day too late.",
      },
      {
        title: "Scoping happens over six messages",
        body: "What do you do, what does it cost, how long does it take. The same qualifying conversation, retyped for every enquiry.",
      },
      {
        title: "Follow-up depends on memory",
        body: "\"Send them the proposal on Monday\" lives in someone's head. The deals that die are rarely the ones you lost — they are the ones you forgot.",
      },
    ],
    flow: [
      {
        label: "Enquiry lands",
        detail: "A prospect asks about a service, a rate or a timeline on your business number.",
      },
      {
        label: "AI reads your service docs",
        detail: "Scope, engagement models, rate card and turnaround, from the documents you uploaded.",
      },
      {
        label: "AI replies and scopes",
        detail: "The prospect gets a real answer and is asked for the requirement, budget range and timeline.",
      },
      {
        label: "Deal enters the pipeline",
        detail: "Assigned to an owner, scored, and a proposal follow-up scheduled from the conversation.",
      },
    ],
    chat: {
      contact: "Devika Nair",
      initials: "DN",
      incoming:
        "We need a monthly retainer for social media and paid ads. What do you charge, and how soon can you start?",
      reply:
        "Our growth retainer covers organic plus paid and starts at ₹85,000/month with a 3-month minimum. Onboarding takes about a week. What's your current monthly ad spend?",
      source: "Services-and-Rate-Card.pdf",
      captured: [
        { label: "Service", value: "Growth retainer" },
        { label: "Budget", value: "₹85k+/month" },
        { label: "Start", value: "Within 2 weeks" },
      ],
      stage: "Proposal",
      owner: "Arjun M.",
    },
    capabilities: [
      {
        Icon: Bot,
        title: "Scope and rates answered from your docs",
        body: "Upload the rate card and the services one-pager. The AI answers what you charge and what is included, in your own words.",
      },
      {
        Icon: Target,
        title: "Qualification before the call",
        body: "Requirement, budget range and start date captured in the chat, so a discovery call starts at the second question, not the first.",
      },
      {
        Icon: Users,
        title: "An owner per enquiry",
        body: "Assignment by service line or round-robin, with the whole thread visible to the team. Nothing sits in one person's inbox.",
      },
      {
        Icon: CalendarClock,
        title: "Proposal follow-ups",
        body: "Schedule the nudge from the conversation the moment you send the proposal, and let the reminder do the chasing.",
      },
      {
        Icon: Workflow,
        title: "A pipeline you can forecast from",
        body: "Enquiry, qualified, proposal, negotiation, won — stages you define, with value and owner on every deal.",
      },
    ],
    outcomes: [
      {
        title: "Replies while you are billable",
        body: "The AI holds the conversation until you are out of the meeting.",
      },
      {
        title: "Discovery calls that start warm",
        body: "Requirement, budget and timeline are on the record before the call is booked.",
      },
      { title: "Follow-ups that happen", body: "The proposal nudge is scheduled, not remembered." },
    ],
  },
  {
    id: "ecommerce",
    Icon: ShoppingCart,
    accent: "emerald",
    name: "E-commerce & D2C",
    short: "E-commerce",
    line: "Cart questions delay purchases.",
    problem: "One unanswered question is one abandoned cart.",
    solution: "AI answers product, order and returns questions and wins the cart back.",
    summary:
      "Recover abandoned carts and handle order queries where your customers already are — WhatsApp beats email open rates by 5×.",
    useCases: [
      "Order status and shipping queries on autopilot",
      "Abandoned-cart and restock campaigns",
      "Returns and refunds tracked as tickets",
    ],
    heroTitle: "Answer the question that is holding up the checkout",
    problems: [
      {
        title: "\"Where is my order\" is most of your support",
        body: "The same tracking question, all day, every day, on a channel your customers prefer and your helpdesk does not cover.",
      },
      {
        title: "Carts abandoned over one unanswered question",
        body: "Will it fit, when will it arrive, can I return it. A buyer who cannot get an answer in a minute closes the tab.",
      },
      {
        title: "Returns turn into arguments",
        body: "Refund requests spread across chat, email and a phone call, with nobody able to say what was promised or when.",
      },
    ],
    flow: [
      {
        label: "Shopper asks",
        detail: "A product, sizing, shipping or returns question arrives before or after the order.",
      },
      {
        label: "AI reads your policies",
        detail: "Catalogue, shipping timelines and the returns policy you uploaded — nothing invented.",
      },
      {
        label: "AI clears the blocker",
        detail: "The buyer gets a definite answer in seconds, at the moment they are deciding.",
      },
      {
        label: "Ticket or campaign",
        detail: "A refund becomes a tracked ticket; a browsing buyer becomes a segment for the next cart campaign.",
      },
    ],
    chat: {
      contact: "Farhan Qureshi",
      initials: "FQ",
      incoming: "If the size doesn't fit, can I exchange it? And how long does delivery take to Pune?",
      reply:
        "Yes — free size exchange within 14 days of delivery, unworn with tags. Pune usually delivers in 3–4 working days, and there's free shipping over ₹999.",
      source: "Shipping-and-Returns-Policy.pdf",
      captured: [
        { label: "Blocker", value: "Exchange policy" },
        { label: "City", value: "Pune" },
        { label: "Stage", value: "Cart, deciding" },
      ],
      stage: "Cart recovery",
      owner: "Support queue",
    },
    capabilities: [
      {
        Icon: Bot,
        title: "Product and policy answers",
        body: "Sizing, materials, shipping timelines, returns and refunds — answered from your own catalogue and policy documents.",
      },
      {
        Icon: Truck,
        title: "Order and shipping queries",
        body: "The routine \"where is my order\" traffic handled without a human, with anything unusual passed straight to support.",
      },
      {
        Icon: Megaphone,
        title: "Abandoned-cart and restock campaigns",
        body: "Broadcast to the segment that asked about a product but never ordered, on a channel that gets opened.",
      },
      {
        Icon: FileCheck2,
        title: "Returns as tickets",
        body: "A refund request becomes a ticket with a status and an owner, so nobody has to reconstruct what was agreed.",
      },
      {
        Icon: BarChart3,
        title: "What blocks checkout",
        body: "The questions that come up most before an order — the fastest product-page fix list you will ever get.",
      },
    ],
    outcomes: [
      {
        title: "Carts recovered in the chat",
        body: "The blocker is answered while the buyer is still deciding, not the next morning.",
      },
      {
        title: "Support volume down",
        body: "Tracking, sizing and returns questions resolve without a person touching them.",
      },
      {
        title: "A segment worth broadcasting to",
        body: "Every conversation is a contact tagged with the product behind it.",
      },
    ],
  },
  {
    id: "finance",
    Icon: Landmark,
    accent: "cyan",
    name: "Finance & Insurance",
    short: "Finance",
    line: "Advisors call unqualified leads all day.",
    problem: "Advisors spend the day on leads that never qualified.",
    solution: "AI checks eligibility and collects documents before anyone calls.",
    summary:
      "Qualify loan and policy leads before an advisor picks up the phone, so their time goes to the applications most likely to convert.",
    useCases: [
      "AI qualification on income and eligibility",
      "Document collection over WhatsApp",
      "Renewal and premium-due reminders",
    ],
    heroTitle: "Advisors on the applications that convert, not the ones that never could",
    problems: [
      {
        title: "Eligibility is discovered on the call",
        body: "Income, employment type, existing obligations. Half of every advisor's day goes on finding out that a lead was never eligible.",
      },
      {
        title: "Document collection takes a week",
        body: "PAN, salary slips, bank statements — chased one message at a time, across a dozen applicants, by a person who has other work.",
      },
      {
        title: "Renewals slip quietly",
        body: "A premium due date nobody was reminded of is a policy that lapses, and a customer who does not come back.",
      },
    ],
    flow: [
      {
        label: "Enquiry arrives",
        detail: "Someone asks about a loan, a policy or a premium on your business number.",
      },
      {
        label: "AI checks the criteria",
        detail: "Product terms, eligibility and documentation requirements read from your own approved material.",
      },
      {
        label: "AI replies and pre-qualifies",
        detail: "Income band, employment type, loan amount or cover needed — captured in the conversation.",
      },
      {
        label: "Advisor gets a ready file",
        detail: "The lead is scored, routed to the right advisor, and documents are collected in the same thread.",
      },
    ],
    chat: {
      contact: "Nikhil Bansal",
      initials: "NB",
      incoming:
        "Looking for a home loan of about 55 lakhs. I'm salaried, take-home 1.6L a month. What rate can I get?",
      reply:
        "For a salaried applicant at that income, ₹55L over 20 years is comfortably in range — current rate is 8.45% p.a. with processing at 0.35%. I'll need PAN, 3 salary slips and 6 months of statements to confirm.",
      source: "Home-Loan-Eligibility-and-Rates.pdf",
      captured: [
        { label: "Amount", value: "₹55L" },
        { label: "Profile", value: "Salaried · ₹1.6L pm" },
        { label: "Stage", value: "Docs pending" },
      ],
      stage: "Pre-qualified",
      owner: "Loan desk",
    },
    capabilities: [
      {
        Icon: BadgeCheck,
        title: "Eligibility answered up front",
        body: "Rates, tenures, cover and criteria answered from your approved product documents, so nobody is quoted a number you cannot honour.",
      },
      {
        Icon: Target,
        title: "Pre-qualification in the chat",
        body: "Income band, employment type, amount required and urgency — captured and scored before an advisor spends a minute on the file.",
      },
      {
        Icon: FileCheck2,
        title: "Document collection in the thread",
        body: "PAN, slips and statements requested, received and stored against the lead, with a chase for whatever is still missing.",
      },
      {
        Icon: Bell,
        title: "Renewal and premium reminders",
        body: "Due dates scheduled as reminders on the customer's own thread, so a lapse takes an active decision rather than an oversight.",
      },
      {
        Icon: ShieldCheck,
        title: "Handover on anything sensitive",
        body: "Advice, disputes and anything the AI is unsure of stop automation and flag a human, with the full transcript attached.",
      },
    ],
    outcomes: [
      {
        title: "Calls that start qualified",
        body: "Income, amount and employment type are on the record before the phone rings.",
      },
      {
        title: "Files complete sooner",
        body: "Documents are requested and chased in the same thread the enquiry arrived on.",
      },
      {
        title: "Fewer lapsed renewals",
        body: "Every due date carries a reminder that does not depend on anyone remembering.",
      },
    ],
  },
  {
    id: "automotive",
    Icon: Car,
    accent: "rose",
    name: "Automotive",
    short: "Automotive",
    line: "Test-drive leads lost before the showroom.",
    problem: "Test-drive enquiries never make it to the showroom.",
    solution: "AI answers variant and finance questions and books the drive.",
    summary:
      "From first enquiry to test drive to service reminder — keep the whole customer lifecycle in one pipeline.",
    useCases: [
      "Test-drive booking straight from a chat",
      "Model, variant and finance queries answered",
      "Service and insurance renewal campaigns",
    ],
    heroTitle: "From \"what's the on-road price\" to a booked test drive",
    problems: [
      {
        title: "Variant and price questions never end",
        body: "On-road price, variant differences, waiting period, EMI. Sales staff answer the same grid a hundred times a week instead of selling.",
      },
      {
        title: "Test drives get booked and forgotten",
        body: "A slot agreed in a chat, with no reminder and no owner, is a showroom appointment that quietly does not happen.",
      },
      {
        title: "The customer disappears after delivery",
        body: "Service intervals, insurance renewals and exchange offers all need a nudge, and nobody has a list to nudge from.",
      },
    ],
    flow: [
      {
        label: "Buyer enquires",
        detail: "A question about a model, a variant, the on-road price or an EMI arrives.",
      },
      {
        label: "AI reads the price list",
        detail: "Variant grid, on-road pricing, waiting periods and finance options from your own documents.",
      },
      {
        label: "AI replies and offers a drive",
        detail: "The buyer gets exact figures and the next available test-drive slots, in seconds.",
      },
      {
        label: "Booked, assigned, reminded",
        detail: "The drive is scheduled with an owner, and the lifecycle reminders start from delivery.",
      },
    ],
    chat: {
      contact: "Imran Shaikh",
      initials: "IS",
      incoming: "What's the on-road price of the top variant, and what would the EMI be for 5 years?",
      reply:
        "The top variant is ₹18.6L on-road in Bengaluru. With 20% down over 60 months at 9.2%, EMI works out to about ₹31,000. Free test drives Sat/Sun — want a slot?",
      source: "Variant-Price-List-and-Finance.pdf",
      captured: [
        { label: "Model", value: "Top variant" },
        { label: "Finance", value: "60-month EMI" },
        { label: "Intent", value: "Test drive" },
      ],
      stage: "Test drive booked",
      owner: "Showroom team",
    },
    capabilities: [
      {
        Icon: Bot,
        title: "Variant, price and EMI answers",
        body: "The on-road grid, waiting periods and finance options answered from your price list, with no room for a wrong quote.",
      },
      {
        Icon: CalendarClock,
        title: "Test-drive booking and reminders",
        body: "The slot is agreed in the chat, assigned to a salesperson and reminded before the day, so the appointment holds.",
      },
      {
        Icon: Target,
        title: "Buyer scoring",
        body: "Model, budget, finance intent and purchase window scored automatically, so the showroom calls the ready buyers first.",
      },
      {
        Icon: Workflow,
        title: "One lifecycle pipeline",
        body: "Enquiry, test drive, booking, delivery, service — the same contact record from the first message to the second car.",
      },
      {
        Icon: Megaphone,
        title: "Service and renewal campaigns",
        body: "Broadcast service due dates, insurance renewals and exchange offers to the customers who actually bought.",
      },
    ],
    outcomes: [
      {
        title: "Test drives that happen",
        body: "Booked in the chat, assigned to a person, reminded before the day.",
      },
      {
        title: "Sales staff on the floor",
        body: "The price grid answers itself, so the team is with the customers who came in.",
      },
      {
        title: "Customers who come back",
        body: "Service and renewal reminders keep the relationship alive past delivery.",
      },
    ],
  },
];

/** Lookup by route segment. `undefined` for an unknown slug, so the page 404s. */
export function getIndustry(id: string): Industry | undefined {
  return INDUSTRIES.find((industry) => industry.id === id);
}

/**
 * The next few industries after this one, for the "explore another" rail.
 *
 * Wraps around from the current position rather than slicing from the top, so every
 * detail page suggests a different trio and no industry is permanently invisible.
 */
export function getOtherIndustries(id: string, count = 3): Industry[] {
  const index = INDUSTRIES.findIndex((industry) => industry.id === id);
  if (index === -1) return INDUSTRIES.slice(0, count);
  return Array.from(
    { length: Math.min(count, INDUSTRIES.length - 1) },
    (_, offset) => INDUSTRIES[(index + offset + 1) % INDUSTRIES.length],
  );
}

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
