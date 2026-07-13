"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export type FaqItem = {
  question: string;
  answer: string;
};

export default function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        const triggerId = `faq-trigger-${index}`;
        const panelId = `faq-panel-${index}`;

        return (
          <div key={item.question}>
            <button
              type="button"
              id={triggerId}
              onClick={() => setOpenIndex(isOpen ? null : index)}
              aria-expanded={isOpen}
              aria-controls={panelId}
              className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-gray-50"
            >
              <span className="text-sm font-semibold text-gray-900 sm:text-base">
                {item.question}
              </span>
              <ChevronDown
                aria-hidden="true"
                className={
                  isOpen
                    ? "h-5 w-5 shrink-0 rotate-180 text-[#6C3FC4] transition-transform"
                    : "h-5 w-5 shrink-0 text-gray-400 transition-transform"
                }
              />
            </button>

            {isOpen && (
              <p
                id={panelId}
                role="region"
                aria-labelledby={triggerId}
                className="px-6 pb-5 text-sm leading-relaxed text-gray-600"
              >
                {item.answer}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
