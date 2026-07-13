import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  Bot,
  ChartColumn,
  Check,
  Megaphone,
  MessageSquare,
  TrendingUp,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Features — WhatsCRM",
  description:
    "WhatsApp shared inbox, AI auto-reply, lead pipeline, bulk campaigns, analytics and an AI knowledge base — everything your team needs to sell on WhatsApp.",
};

/* ---------- Mockups (pure Tailwind, no image assets) ---------- */

function InboxMockup() {
  return (
    <MockupFrame title="Shared Inbox">
      <div className="space-y-3">
        {[
          { initials: "RK", name: "Rahul Kumar", msg: "Is the 2BHK still available?", tag: "Priya" },
          { initials: "SP", name: "Sneha Patel", msg: "Please share the price list", tag: "Unassigned" },
          { initials: "AV", name: "Amit Verma", msg: "Can we schedule a demo?", tag: "Rohan" },
        ].map((chat) => (
          <div
            key={chat.name}
            className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#6C3FC4]/10 text-xs font-semibold text-[#6C3FC4]">
              {chat.initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-gray-900">{chat.name}</span>
              <span className="block truncate text-xs text-gray-500">{chat.msg}</span>
            </span>
            <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-[10px] font-medium text-gray-600">
              {chat.tag}
            </span>
          </div>
        ))}
      </div>
    </MockupFrame>
  );
}

function AiReplyMockup() {
  return (
    <MockupFrame title="AI Auto-Reply">
      <div className="space-y-3">
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-4 py-2.5 text-sm text-gray-800 shadow-sm">
          What are your fees for the 6-month course?
        </div>
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-[#6C3FC4] px-4 py-2.5 text-sm text-white shadow-sm">
          Our 6-month program is ₹45,000, with an EMI option at ₹7,500/month. Shall I book a free
          counselling call for you?
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-[#6C3FC4]/5 px-3 py-2">
          <Bot className="h-4 w-4 shrink-0 text-[#6C3FC4]" />
          <span className="text-xs font-medium text-[#6C3FC4]">
            Answered by AI from your knowledge base · 1.2s
          </span>
        </div>
      </div>
    </MockupFrame>
  );
}

function PipelineMockup() {
  return (
    <MockupFrame title="Lead Pipeline">
      <div className="grid grid-cols-3 gap-2">
        {[
          { stage: "Qualified", score: "HOT", color: "bg-red-100 text-red-700", value: "₹1.2 Cr" },
          {
            stage: "Proposal",
            score: "WARM",
            color: "bg-orange-100 text-orange-700",
            value: "₹85 L",
          },
          {
            stage: "Won",
            score: "QUALIFIED",
            color: "bg-green-100 text-green-700",
            value: "₹64 L",
          },
        ].map((col) => (
          <div key={col.stage} className="rounded-xl bg-white p-2">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              {col.stage}
            </p>
            <div className="rounded-lg border border-gray-100 p-2">
              <span
                className={`inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold ${col.color}`}
              >
                {col.score}
              </span>
              <p className="mt-1.5 text-xs font-semibold text-gray-900">{col.value}</p>
              <p className="text-[10px] text-gray-500">3 days in stage</p>
            </div>
          </div>
        ))}
      </div>
    </MockupFrame>
  );
}

function CampaignMockup() {
  return (
    <MockupFrame title="Campaigns">
      <div className="rounded-xl bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900">Diwali Offer 2026</p>
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
            Completed
          </span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full w-[94%] rounded-full bg-[#6C3FC4]" />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            { label: "Sent", value: "4,712" },
            { label: "Delivered", value: "4,431" },
            { label: "Replied", value: "1,208" },
          ].map((stat) => (
            <div key={stat.label}>
              <p className="text-sm font-bold text-gray-900">{stat.value}</p>
              <p className="text-[10px] text-gray-500">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </MockupFrame>
  );
}

function AnalyticsMockup() {
  const bars = [40, 65, 50, 80, 60, 95, 75];

  return (
    <MockupFrame title="Analytics">
      <div className="rounded-xl bg-white p-4">
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Conversations", value: "2,481" },
            { label: "Conversion rate", value: "31.4%" },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-lg border border-gray-100 p-3">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">{kpi.label}</p>
              <p className="mt-1 text-lg font-bold text-gray-900">{kpi.value}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex h-24 items-end gap-2">
          {bars.map((height, index) => (
            <div
              key={index}
              className="flex-1 rounded-t bg-[#6C3FC4]"
              style={{ height: `${height}%`, opacity: 0.35 + index * 0.09 }}
            />
          ))}
        </div>
      </div>
    </MockupFrame>
  );
}

function KnowledgeMockup() {
  return (
    <MockupFrame title="Knowledge Base">
      <div className="space-y-2">
        {[
          { name: "Product-Catalogue-2026.pdf", size: "2.4 MB" },
          { name: "Pricing-and-EMI-Policy.docx", size: "184 KB" },
          { name: "Refund-and-Shipping-FAQ.md", size: "31 KB" },
        ].map((doc) => (
          <div
            key={doc.name}
            className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3"
          >
            <BookOpen className="h-4 w-4 shrink-0 text-[#6C3FC4]" />
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-900">
              {doc.name}
            </span>
            <span className="shrink-0 text-[10px] text-gray-400">{doc.size}</span>
            <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[9px] font-semibold text-green-700">
              Indexed
            </span>
          </div>
        ))}
      </div>
    </MockupFrame>
  );
}

function MockupFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 shadow-lg">
      <div className="flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
        <span className="ml-2 text-xs font-medium text-gray-500">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/* ---------- Feature deep-dives ---------- */

const FEATURES = [
  {
    Icon: MessageSquare,
    eyebrow: "Shared Inbox",
    title: "One WhatsApp inbox for your entire team",
    description:
      "Stop juggling a personal phone and a WhatsApp group. Every conversation lands in one shared inbox where any agent can pick it up, assign it, and leave internal notes the customer never sees.",
    points: [
      "Assign chats to specific agents",
      "Internal notes visible only to your team",
      "Filter by Open, Resolved or Mine",
      "Real-time updates — no refresh needed",
    ],
    Mockup: InboxMockup,
  },
  {
    Icon: Bot,
    eyebrow: "AI Auto-Reply",
    title: "AI that answers instantly, 24×7",
    description:
      "Powered by Llama 3.3, WhatsCRM replies to common questions in seconds using your own product data — so a lead that messages at 2 AM gets an answer at 2 AM, not the next morning.",
    points: [
      "Replies grounded in your knowledge base",
      "Custom system prompt in your brand's tone",
      "Hands over to a human whenever you want",
      "Every AI reply is logged and editable",
    ],
    Mockup: AiReplyMockup,
  },
  {
    Icon: TrendingUp,
    eyebrow: "Lead Pipeline",
    title: "A CRM pipeline that scores itself",
    description:
      "Drag leads from New Lead to Won on a visual Kanban board. AI reads the conversation and scores each lead on budget, authority, need and timeline — so you always know who to call first.",
    points: [
      "7 stages from New Lead to Won or Lost",
      "AI scoring: COLD, WARM, HOT, QUALIFIED",
      "Deal value and days-in-stage on every card",
      "Full activity timeline per lead",
    ],
    Mockup: PipelineMockup,
  },
  {
    Icon: Megaphone,
    eyebrow: "Campaigns",
    title: "Bulk campaigns that actually get read",
    description:
      "WhatsApp open rates beat email by a mile. Send an approved template to thousands of contacts at once and watch delivery, reads and replies land back in your shared inbox.",
    points: [
      "Send to a segment or your whole contact list",
      "Meta-approved message templates",
      "Live sent, delivered and failed counts",
      "Replies flow straight into the inbox",
    ],
    Mockup: CampaignMockup,
  },
  {
    Icon: ChartColumn,
    eyebrow: "Analytics",
    title: "Know what is working, in real time",
    description:
      "Track the numbers that decide revenue: conversations handled, average response time, leads created, deals won and conversion rate — across any 7, 30 or 90 day window.",
    points: [
      "8 KPI cards updated in real time",
      "Messages sent vs received over time",
      "Leads by stage breakdown",
      "Per-agent performance view",
    ],
    Mockup: AnalyticsMockup,
  },
  {
    Icon: BookOpen,
    eyebrow: "Knowledge Base",
    title: "Teach the AI your business, once",
    description:
      "Upload your catalogue, pricing sheet and FAQs. WhatsCRM indexes them and the AI answers from your own content — so replies are accurate, current and never invented.",
    points: [
      "Upload PDF, DOCX or Markdown",
      "Answers cite your own documents",
      "Update a doc and the AI updates instantly",
      "Works alongside auto-reply and chatbot",
    ],
    Mockup: KnowledgeMockup,
  },
];

export default function FeaturesPage() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-[#6C3FC4]/5 to-white py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
            Everything you need to close more deals on WhatsApp
          </h1>
          <p className="mt-6 text-base text-gray-600 sm:text-lg">
            Six modules that work together — a shared inbox, an AI that replies, a pipeline that
            scores leads, campaigns, analytics and a knowledge base. One platform, one price.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <Link
              href="/register"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#6C3FC4] px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-[#6C3FC4]/20 transition-colors hover:bg-[#5A32A6] sm:w-auto"
            >
              Start Free Trial
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-6 py-3.5 text-base font-semibold text-gray-700 transition-colors hover:bg-gray-50 sm:w-auto"
            >
              See Pricing
            </Link>
          </div>
        </div>
      </section>

      {/* Deep-dives — layout alternates on lg and up */}
      {FEATURES.map(({ Icon, eyebrow, title, description, points, Mockup }, index) => {
        const isReversed = index % 2 === 1;

        return (
          <section
            key={title}
            className={index % 2 === 1 ? "bg-gray-50 py-16 sm:py-20" : "py-16 sm:py-20"}
          >
            <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
              <div className={isReversed ? "lg:order-2" : ""}>
                <span className="inline-flex items-center gap-2 rounded-full bg-[#6C3FC4]/10 px-3 py-1 text-xs font-semibold text-[#6C3FC4]">
                  <Icon className="h-4 w-4" />
                  {eyebrow}
                </span>
                <h2 className="mt-5 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                  {title}
                </h2>
                <p className="mt-4 text-base leading-relaxed text-gray-600 sm:text-lg">
                  {description}
                </p>
                <ul className="mt-6 space-y-3">
                  {points.map((point) => (
                    <li key={point} className="flex items-start gap-3">
                      <Check className="mt-0.5 h-5 w-5 shrink-0 text-[#6C3FC4]" />
                      <span className="text-sm text-gray-700 sm:text-base">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className={isReversed ? "lg:order-1" : ""}>
                <Mockup />
              </div>
            </div>
          </section>
        );
      })}

      {/* CTA banner */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-[#6C3FC4] px-6 py-14 text-center sm:px-12 sm:py-16">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              See it working on your own WhatsApp number
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-white/80 sm:text-lg">
              Connect your number and send your first AI-powered reply in under five minutes.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <Link
                href="/register"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-6 py-3.5 text-base font-semibold text-[#6C3FC4] shadow-lg transition-colors hover:bg-gray-100 sm:w-auto"
              >
                Start Free Trial
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="/contact"
                className="inline-flex w-full items-center justify-center rounded-lg border border-white/40 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-white/10 sm:w-auto"
              >
                Book a Demo
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
