"use client";

/**
 * Which FAQ questions customers actually tap.
 *
 * The counterpart to the editor above it: that pane is what you think customers
 * want to know, this one is what they asked. The gap between the two is the
 * whole reason to collect the taps.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MousePointerClick, TrendingUp, Users } from "lucide-react";
import { Card } from "@/components/ui";
import { Segmented } from "@/components/admin/ui";
import { FAQ_INTENTS, type FaqIntent } from "@/lib/knowledgeFaq";
import { cn, formatDate } from "@/lib/utils";

interface InterestRow {
  question: string;
  intent: FaqIntent;
  taps: number;
  contacts: number;
  lastAsked: string;
}

interface Interest {
  days: number;
  totalTaps: number;
  uniqueContacts: number;
  buyingSignals: number;
  questions: InterestRow[];
}

type Window = "7" | "30" | "90";

const INTENT_STYLE: Record<FaqIntent, string> = {
  buying: "bg-emerald-100 text-emerald-800",
  interest: "bg-amber-100 text-amber-800",
  none: "bg-slate-100 text-slate-500",
};

const INTENT_LABEL = Object.fromEntries(
  FAQ_INTENTS.map((i) => [i.value, i.label]),
) as Record<FaqIntent, string>;

export function FaqInterest() {
  const [days, setDays] = useState<Window>("30");

  const { data, isLoading } = useQuery<Interest>({
    queryKey: ["knowledge", "faq-interest", days],
    queryFn: async () => {
      const res = await fetch(`/api/knowledge/faqs/interest?days=${days}`);
      if (!res.ok) throw new Error(`Failed to load FAQ interest (${res.status})`);
      const json = await res.json();
      return json.data as Interest;
    },
    retry: false,
  });

  return (
    <Card className="mt-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            What customers asked
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Questions tapped from a FAQ menu you sent in WhatsApp.
          </p>
        </div>
        <Segmented<Window>
          value={days}
          onChange={setDays}
          options={[
            { value: "7", label: "7 days" },
            { value: "30", label: "30 days" },
            { value: "90", label: "90 days" },
          ]}
        />
      </div>

      {isLoading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </p>
      ) : !data || data.questions.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          {/* Not an error state. Nothing has been tapped because nothing has been
              sent, and the fix is a sentence away rather than a support ticket. */}
          Nothing tapped yet. Send a question menu from the Inbox — the FAQ icon in the composer —
          and every tap lands here.
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Stat icon={MousePointerClick} label="Taps" value={data.totalTaps} />
            <Stat icon={Users} label="People" value={data.uniqueContacts} />
            <Stat
              icon={TrendingUp}
              label="Buying signals"
              value={data.buyingSignals}
              tone={data.buyingSignals > 0 ? "emerald" : "slate"}
            />
          </div>

          <div className="scrollbar-slim mt-4 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="pb-2 pr-3 font-medium">Question</th>
                  <th className="pb-2 px-3 text-right font-medium">People</th>
                  <th className="pb-2 px-3 text-right font-medium">Taps</th>
                  <th className="pb-2 pl-3 font-medium">Last asked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.questions.map((row) => (
                  <tr key={row.question} className="align-top">
                    <td className="py-2.5 pr-3">
                      <span className="block text-slate-800">{row.question}</span>
                      {row.intent !== "none" && (
                        <span
                          className={cn(
                            "mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium",
                            INTENT_STYLE[row.intent],
                          )}
                        >
                          {INTENT_LABEL[row.intent]}
                        </span>
                      )}
                    </td>
                    {/* People before taps: how many different customers needed
                        this is the better signal, and one person tapping eight
                        times is a support problem, not demand. */}
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums text-slate-900">
                      {row.contacts}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{row.taps}</td>
                    <td className="py-2.5 pl-3 text-slate-500">{formatDate(row.lastAsked)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone = "slate",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone?: "slate" | "emerald";
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <Icon className={cn("h-4 w-4", tone === "emerald" ? "text-emerald-600" : "text-slate-400")} />
      <p className="mt-1.5 text-xl font-semibold tabular-nums text-slate-900">
        {value.toLocaleString("en-IN")}
      </p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
