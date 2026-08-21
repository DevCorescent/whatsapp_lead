"use client";

/**
 * Send a curated FAQ list into the open conversation.
 *
 * The customer gets a tappable menu; tapping a row sends back the answer the
 * tenant wrote — no model call, no AI credit, no invented price — and records
 * which question they chose. That last part is the point: a contact who taps
 * "How do I pay?" has told you something no page view could.
 *
 * Lives in the composer because that is the only place a conversation exists to
 * send into.
 */

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, Check, FileStack, FileText, Loader2 } from "lucide-react";
import type { KnowledgeDoc } from "@prisma/client";
import { readFaqState } from "@/lib/knowledgeFaq";
import { useFaqSets } from "@/components/knowledge/faqSets";
import { postJson } from "@/components/knowledge/api";
import { cn } from "@/lib/utils";

interface Option {
  kind: "document" | "set";
  id: string;
  title: string;
  count: number;
}

export function FaqMenuPicker({
  conversationId,
  onClose,
}: {
  conversationId: string;
  onClose: () => void;
}) {
  const [sentId, setSentId] = useState<string | null>(null);

  const { data: docs = [], isLoading: docsLoading } = useQuery<KnowledgeDoc[]>({
    queryKey: ["knowledge"],
    queryFn: async () => {
      const res = await fetch("/api/knowledge");
      if (!res.ok) throw new Error(`Failed to load documents (${res.status})`);
      const json = await res.json();
      return Array.isArray(json) ? json : (json.data ?? []);
    },
    retry: false,
  });
  const { data: sets = [], isLoading: setsLoading } = useFaqSets();

  // Only lists with at least one ANSWERED question. A menu row that leads
  // nowhere is worse than a shorter menu.
  const options: Option[] = [
    ...docs
      .map((d) => ({
        kind: "document" as const,
        id: d.id,
        title: d.name,
        count: readFaqState(d.metadata).faqs.filter((f) => f.answer).length,
      }))
      .filter((o) => o.count > 0),
    ...sets
      .map((s) => ({
        kind: "set" as const,
        id: s.id,
        title: s.name,
        count: s.faqs.filter((f) => f.answer).length,
      }))
      .filter((o) => o.count > 0),
  ];

  const send = useMutation({
    mutationFn: async (option: Option) => {
      const json = await postJson<{ sent: number; dropped: number; maxRows: number }>(
        "/api/knowledge/faqs/send",
        { conversationId, kind: option.kind, sourceId: option.id },
      );
      return { option, result: json.data };
    },
    onSuccess: ({ option }) => {
      setSentId(option.id);
      // Left open briefly so the confirmation is seen — closing instantly reads
      // as the click having done nothing.
      setTimeout(onClose, 900);
    },
  });

  const loading = docsLoading || setsLoading;

  return (
    <div className="absolute bottom-full left-0 z-20 mb-2 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
      <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Send a question menu
      </p>

      {loading ? (
        <p className="flex items-center gap-2 px-2 py-3 text-sm text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </p>
      ) : options.length === 0 ? (
        <p className="px-2 py-3 text-sm text-slate-500">
          No answered FAQs yet. Write some in Knowledge Base → FAQs and they will appear here.
        </p>
      ) : (
        <ul className="scrollbar-slim max-h-64 overflow-y-auto">
          {options.map((option) => {
            const busy = send.isPending && send.variables?.id === option.id;
            const done = sentId === option.id;
            return (
              <li key={`${option.kind}:${option.id}`}>
                <button
                  type="button"
                  disabled={send.isPending}
                  onClick={() => send.mutate(option)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition",
                    done ? "bg-emerald-50" : "hover:bg-slate-50",
                    send.isPending && !busy && "opacity-50",
                  )}
                >
                  {option.kind === "set" ? (
                    <FileStack className="h-4 w-4 shrink-0 text-slate-400" />
                  ) : (
                    <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-800">{option.title}</span>
                    <span className="text-xs text-slate-400">
                      {option.count} question{option.count === 1 ? "" : "s"}
                      {/* Meta caps a list at ten rows; say so before the click. */}
                      {option.count > 10 && " · first 10 sent"}
                    </span>
                  </span>
                  {busy && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" />}
                  {done && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {send.isError && (
        <p className="flex items-start gap-1.5 rounded-lg bg-rose-50 px-2 py-1.5 text-xs text-rose-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{(send.error as Error).message}</span>
        </p>
      )}
    </div>
  );
}
