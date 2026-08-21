"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button, Modal, inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { runFlowStep, type FlowVariables } from "@/lib/chatbot/engine";
import type { FlowDocument } from "@/lib/chatbot/types";

type ChatLine = {
  from: "bot" | "user" | "system";
  text: string;
  /**
   * A menu's tappable options. Present only on the most recent menu line, so the
   * author clicks their own tree exactly as a customer would rather than typing
   * "2" and hoping the matcher agrees.
   */
  options?: { id: string; label: string }[];
};
type Step = Awaited<ReturnType<typeof runFlowStep>>;

// Preview simulates API/AI nodes (no live calls) so authors can trace the flow.
const simExecutors = {
  callApi: async () => "[simulated API response]",
  callAi: async (n: { prompt?: string }) => `[AI reply${n.prompt ? `: ${n.prompt.slice(0, 40)}` : ""}]`,
};

/** Pull the tappable rows out of either interactive shape Meta accepts. */
function readMenuRows(interactive: Record<string, unknown>): { id: string; label: string }[] {
  const action = interactive.action as Record<string, unknown> | undefined;
  if (!action) return [];

  const buttons = action.buttons as { reply?: { id?: string; title?: string } }[] | undefined;
  if (Array.isArray(buttons)) {
    return buttons.map((b) => ({ id: b.reply?.id ?? "", label: b.reply?.title ?? "" })).filter((b) => b.id);
  }

  const sections = action.sections as { rows?: { id?: string; title?: string }[] }[] | undefined;
  if (Array.isArray(sections)) {
    return sections
      .flatMap((s) => s.rows ?? [])
      .map((r) => ({ id: r.id ?? "", label: r.title ?? "" }))
      .filter((r) => r.id);
  }

  return [];
}

function stepToLines(step: Step): ChatLine[] {
  return step.actions.flatMap((a): ChatLine[] => {
    if (a.type === "message" || a.type === "ai") return a.text ? [{ from: "bot", text: a.text }] : [];
    if (a.type === "delay") return [{ from: "system", text: `⏱ waits ${a.seconds ?? 0}s` }];
    if (a.type === "api") return [{ from: "system", text: `🔗 ${a.api?.method ?? "GET"} ${a.api?.url ?? ""}` }];
    if (a.type === "handoff") return [{ from: "system", text: `👤 Handoff${a.handoff?.department ? ` → ${a.handoff.department}` : ""}` }];
    if (a.type === "menu" && a.menu) {
      // The rows are read back out of the payload that would go to Meta, so the
      // preview cannot drift from what a customer would actually be sent.
      const rows = readMenuRows(a.menu.interactive);
      const body = (a.menu.interactive.body as { text?: string } | undefined)?.text ?? "";
      return [{ from: "bot", text: body, options: rows }];
    }
    return [];
  });
}

/**
 * Test / Preview — a client-side simulator that walks the flow with the shared
 * engine. Mounted fresh each time the modal opens (via the `open &&` gate) so every
 * run starts clean without a reset effect.
 */
export function PreviewPanel({ open, onClose, doc }: { open: boolean; onClose: () => void; doc: FlowDocument }) {
  return (
    <Modal open={open} onClose={onClose} title="Test flow" description="Simulated run — API and AI steps are mocked.">
      {open && <Simulator doc={doc} />}
    </Modal>
  );
}

function Simulator({ doc }: { doc: FlowDocument }) {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [variables, setVariables] = useState<FlowVariables>({});
  const [awaiting, setAwaiting] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  function applyStep(step: Step, prior: ChatLine[]) {
    const next = [...prior, ...stepToLines(step)];
    setVariables(step.variables);
    if (step.status === "awaiting_input") {
      setAwaiting(step.awaitingQuestionId);
      setDone(false);
      setLines(next);
    } else {
      setAwaiting(null);
      setDone(true);
      setLines([...next, { from: "system", text: step.status === "dead_end" ? "⚠ Flow reached a dead end." : "✓ Flow ended." }]);
    }
  }

  // Kick off the run on mount. Async, so no synchronous setState in the effect body.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const step = await runFlowStep(doc, { variables: {}, executors: simExecutors });
      if (!cancelled) applyStep(step, []);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  async function sendInput(tapped?: { id: string; label: string }) {
    if (!awaiting) return;
    const userText = tapped ? tapped.label : input.trim();
    if (!userText) return;

    const prior: ChatLine[] = [...lines, { from: "user", text: userText }];
    setLines(prior);
    setInput("");

    const step = await runFlowStep(doc, {
      fromNodeId: awaiting,
      input: userText,
      // Only a tap carries an id. Typing the same words goes down the text
      // matcher instead, which is the path the author most needs to test.
      replyId: tapped?.id ?? null,
      variables,
      executors: simExecutors,
    });
    applyStep(step, prior);
  }

  return (
    <div className="space-y-3">
      <div ref={scrollRef} className="scrollbar-slim h-80 space-y-2 overflow-y-auto rounded-xl bg-slate-50 p-3">
        {lines.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">Starting…</p>
        ) : (
          lines.map((l, i) => (
            <div key={i} className={cn("flex", l.from === "user" ? "justify-end" : l.from === "system" ? "justify-center" : "justify-start")}>
              {l.from === "system" ? (
                <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] text-slate-600">{l.text}</span>
              ) : (
                <span
                  className={cn(
                    "max-w-[75%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm shadow-sm",
                    l.from === "user" ? "bg-emerald-600 text-white" : "bg-white text-slate-800 ring-1 ring-slate-200",
                  )}
                >
                  {l.text}
                </span>
              )}
              {/* Only the newest menu stays tappable — an old one would let the
                  author answer a screen the flow has already moved past. */}
              {l.options && l.options.length > 0 && i === lines.length - 1 && awaiting && (
                <div className="ml-2 flex max-w-[75%] flex-wrap gap-1.5 self-end">
                  {l.options.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => void sendInput(o)}
                      className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-emerald-700 shadow-sm ring-1 ring-emerald-200 transition hover:bg-emerald-50"
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {Object.keys(variables).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(variables).map(([k, v]) => (
            <span key={k} className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-700 ring-1 ring-inset ring-sky-600/20">
              {k}: {v || "—"}
            </span>
          ))}
        </div>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void sendInput();
        }}
      >
        <input
          className={inputClass}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!awaiting}
          placeholder={awaiting ? "Type a reply…" : done ? "Run finished" : "Waiting for the bot…"}
        />
        <Button type="submit" disabled={!awaiting || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
