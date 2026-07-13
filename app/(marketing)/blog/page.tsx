import type { Metadata } from "next";
import { Clock } from "lucide-react";

export const metadata: Metadata = {
  title: "Blog — WhatsCRM",
  description:
    "Guides and playbooks on WhatsApp marketing, AI automation and running a sales pipeline that actually converts.",
};

const POSTS = [
  {
    title: "7 WhatsApp templates that get a 40% reply rate",
    excerpt:
      "The exact opening messages our best-performing customers use — and why the shortest ones win.",
    category: "WhatsApp Marketing",
    author: "Neha Kulkarni",
    date: "8 July 2026",
    readTime: "6 min read",
    gradient: "from-[#6C3FC4] to-[#9B6FE0]",
  },
  {
    title: "How AI lead scoring actually works (BANT, explained)",
    excerpt:
      "Budget, Authority, Need, Timeline. A plain-English look at how the model reads a chat and produces a score out of 100.",
    category: "AI",
    author: "Rishi Bansal",
    date: "1 July 2026",
    readTime: "9 min read",
    gradient: "from-[#4C2A8C] to-[#6C3FC4]",
  },
  {
    title: "Stop running your sales team out of a WhatsApp group",
    excerpt:
      "Group chats have no owner, no history and no accountability. Here is what a shared inbox changes.",
    category: "CRM",
    author: "Aditya Raghav",
    date: "24 June 2026",
    readTime: "5 min read",
    gradient: "from-[#6C3FC4] to-[#C13584]",
  },
  {
    title: "Setting up the WhatsApp Business Cloud API without a developer",
    excerpt:
      "A step-by-step walkthrough of Meta verification, number registration and going live in an afternoon.",
    category: "Automation",
    author: "Kavya Menon",
    date: "17 June 2026",
    readTime: "11 min read",
    gradient: "from-[#2E7D6B] to-[#6C3FC4]",
  },
  {
    title: "Abandoned cart recovery on WhatsApp: a D2C playbook",
    excerpt:
      "What to send, when to send it, and the one message that recovered ₹18 lakh for a skincare brand last quarter.",
    category: "WhatsApp Marketing",
    author: "Neha Kulkarni",
    date: "9 June 2026",
    readTime: "7 min read",
    gradient: "from-[#6C3FC4] to-[#3F51B5]",
  },
  {
    title: "Why your auto-reply should hand over to a human sooner",
    excerpt:
      "AI is great at the first three messages. Here is how to spot the moment it should step aside.",
    category: "AI",
    author: "Rishi Bansal",
    date: "2 June 2026",
    readTime: "4 min read",
    gradient: "from-[#8E44AD] to-[#6C3FC4]",
  },
];

export default function BlogPage() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-[#6C3FC4]/5 to-white py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
            The WhatsCRM blog
          </h1>
          <p className="mt-6 text-base text-gray-600 sm:text-lg">
            Playbooks on WhatsApp marketing, AI automation and building a pipeline that converts —
            written by the team that builds the product.
          </p>
        </div>
      </section>

      {/* Posts */}
      <section className="pb-16 sm:pb-20 lg:pb-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {POSTS.map((post) => (
              <article
                key={post.title}
                className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white transition-shadow hover:shadow-lg"
              >
                {/* Cover: gradient placeholder instead of an image asset */}
                <div className={`h-40 bg-gradient-to-br ${post.gradient}`} />

                <div className="flex flex-1 flex-col p-6">
                  <span className="w-fit rounded-full bg-[#6C3FC4]/10 px-3 py-1 text-xs font-semibold text-[#6C3FC4]">
                    {post.category}
                  </span>

                  <h2 className="mt-4 text-lg font-semibold leading-snug text-gray-900">
                    {post.title}
                  </h2>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-600">
                    {post.excerpt}
                  </p>

                  <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-900">
                        {post.author}
                      </span>
                      <span className="block text-xs text-gray-500">{post.date}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-gray-500">
                      <Clock className="h-3.5 w-3.5" />
                      {post.readTime}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
