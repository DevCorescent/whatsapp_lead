"use client";

/**
 * The editable FAQ list, shared by every FAQ surface.
 *
 * Two behaviours it exists to provide, both of which a one-shot generator could
 * not:
 *
 *   One at a time — questions are proposed first and answered one by one, so the
 *   list fills in visibly instead of appearing whole after a long pause. A run
 *   can be stopped part-way and what has already been answered is kept.
 *
 *   Edit, then re-answer — rewriting a question and regenerating re-answers only
 *   that row. That is the whole point: the model's phrasing was wrong, and
 *   regenerating the entire list around the correction would throw away the
 *   answers already accepted.
 *
 * The parent supplies the three operations rather than the endpoints, because a
 * document and a multi-document set store their lists in different places and
 * this component has no business knowing which.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Loader2,
  PencilLine,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import {
  FAQ_INTENTS,
  FAQ_INTENT_POINTS,
  FAQ_LENGTHS,
  FAQ_TONES,
  isDefaultFaqStyle,
  type DocFaq,
  type FaqStyle,
} from "@/lib/knowledgeFaq";
import { cn } from "@/lib/utils";

export interface FaqEditorProps {
  /** The stored list. Re-seeds local state when `seedKey` changes. */
  faqs: DocFaq[];
  /**
   * Bumped by the parent when the server copy changes (a row's updatedAt works).
   * Re-seeding on the array identity alone would wipe what the user is typing
   * every time an unrelated poll refreshed the list.
   */
  seedKey: string;
  /** Names of the documents in play. More than one turns on source labels. */
  sources?: string[];
  truncated?: boolean;
  /** A failure recorded on the server. Cleared locally as soon as a run succeeds. */
  storedError?: string | null;
  disabled?: boolean;
  emptyHint?: string;
  /** How answers are written. Stored per collection, edited here. */
  style: FaqStyle;

  proposeQuestions: (existing: string[], count: number, style: FaqStyle) => Promise<string[]>;
  /** Answer `faqs[index]`, given the list as it currently stands on screen. */
  answerQuestion: (index: number, faqs: DocFaq[], style: FaqStyle) => Promise<DocFaq>;
  save: (faqs: DocFaq[], style: FaqStyle) => Promise<void>;
}

/** Batch sizes offered on the generate control. */
const BATCH_SIZES = [3, 5, 8] as const;
const DEFAULT_BATCH = 5;

/**
 * useLayoutEffect on the client, useEffect on the server.
 *
 * These pages are server-rendered on request, and React warns that
 * useLayoutEffect does nothing during that pass. It is the right hook in the
 * browser though — measuring in useEffect would paint one frame at the wrong
 * height, which on a list of six questions is a visible jolt on load.
 */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * A textarea that grows to fit what is in it.
 *
 * Questions are one to three lines and there is no way to know which in advance.
 * A fixed `rows` picks a wrong answer either way — clipping the long ones behind
 * a scrollbar, or leaving a hole under the short ones — and both read as cramped
 * in a list of twenty. Measured rather than done with `field-sizing-content` so
 * it behaves the same in every browser.
 */
function AutoTextarea({
  value,
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Collapse before measuring: scrollHeight never shrinks below the current
    // height, so growing works without this and shrinking never does.
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      className={cn("resize-none overflow-hidden", className)}
      {...props}
    />
  );
}

export function FaqEditor({
  faqs,
  seedKey,
  sources = [],
  truncated,
  storedError,
  disabled,
  emptyHint,
  style: storedStyle,
  proposeQuestions,
  answerQuestion,
  save,
}: FaqEditorProps) {
  const [rows, setRows] = useState<DocFaq[]>(faqs);
  const [style, setStyle] = useState<FaqStyle>(storedStyle);
  const [showStyle, setShowStyle] = useState(false);
  const [batch, setBatch] = useState<number>(DEFAULT_BATCH);
  const [dirty, setDirty] = useState(false);
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed only when the server copy actually changed AND the user has nothing
  // in flight. A refetch landing mid-edit must not overwrite what is being typed.
  const [seenKey, setSeenKey] = useState(seedKey);
  if (seedKey !== seenKey && !dirty && !running && busyIndex === null) {
    setSeenKey(seedKey);
    setRows(faqs);
    setStyle(storedStyle);
  }

  // Read by the generation loop between rows. A ref, not state: the loop is
  // already running when Stop is pressed and would close over a stale `false`.
  const cancelled = useRef(false);
  useEffect(() => () => { cancelled.current = true; }, []);

  const showSources = sources.length > 1;
  const visibleError = error ?? (rows.length === 0 ? storedError : null);

  const patch = useCallback((index: number, next: Partial<DocFaq>) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...next } : row)));
  }, []);

  /**
   * Answer rows from `startAt` onwards, one call at a time, writing each answer
   * in as it lands.
   *
   * Sequential on purpose. Fired in parallel these calls would each persist the
   * whole list, so the last to return would overwrite every answer that arrived
   * before it — and the point of the feature is to watch them appear in order
   * anyway.
   */
  const answerFrom = useCallback(
    async (list: DocFaq[], startAt: number) => {
      cancelled.current = false;
      setRunning(true);
      setError(null);

      let working = list;
      try {
        for (let i = startAt; i < working.length; i++) {
          if (cancelled.current) break;
          if (working[i].answer) continue;

          setBusyIndex(i);
          const answered = await answerQuestion(i, working, style);
          working = working.map((row, j) => (j === i ? answered : row));
          setRows(working);
        }
        // Every answer call persisted the whole list, so whatever was unsaved
        // when the run started is on the server now.
        setDirty(false);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusyIndex(null);
        setRunning(false);
      }
    },
    [answerQuestion, style],
  );

  /**
   * Propose `count` questions and answer them.
   *
   * One path for both buttons. "Add one" is this with count 1 — the same
   * request, the same append, so a single question cannot drift from a batch of
   * five in how it is written or where it lands.
   */
  const suggest = useCallback(async (count: number) => {
    setError(null);
    setRunning(true);
    try {
      const existing = rows.map((r) => r.question).filter(Boolean);
      const questions = await proposeQuestions(existing, count, style);
      // Appended, never replacing. Someone asking for more questions on a list
      // they have already curated is topping it up, not starting over.
      const added: DocFaq[] = questions.map((question) => ({ question, answer: "" }));
      const next = [...rows, ...added];
      setRows(next);
      setRunning(false);
      await answerFrom(next, rows.length);
    } catch (e) {
      setError((e as Error).message);
      setRunning(false);
    }
  }, [rows, proposeQuestions, answerFrom, style]);

  const regenerate = useCallback(
    async (index: number) => {
      if (!rows[index]?.question.trim()) {
        setError("Write the question first.");
        return;
      }
      setError(null);
      setBusyIndex(index);
      try {
        const answered = await answerQuestion(index, rows, style);
        setRows((current) => current.map((row, i) => (i === index ? answered : row)));
        setDirty(false);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusyIndex(null);
      }
    },
    [rows, answerQuestion, style],
  );

  const persist = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await save(rows, style);
      setDirty(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [rows, save, style]);

  /** Changing the style is a change to save, even with no rows touched. */
  const editStyle = useCallback((next: Partial<FaqStyle>) => {
    setStyle((current) => ({ ...current, ...next }));
    setDirty(true);
  }, []);

  const busy = running || saving || busyIndex !== null;

  return (
    <div className="space-y-4">
      {truncated && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-inset ring-amber-600/20">
          {sources.length > 1
            ? "These documents are long — the questions come from the opening sections of each. The AI still searches all of them when answering a customer."
            : "This document is long — these questions come from its opening sections. The AI still searches the whole document when answering."}
        </p>
      )}

      {rows.length === 0 && !running && (
        <p className="py-2 text-sm text-slate-500">
          {emptyHint ?? "No questions yet. Suggest a few, or write your own."}
        </p>
      )}

      <ol className="space-y-3">
        {rows.map((row, index) => {
          const answering = busyIndex === index;
          return (
            <li
              key={index}
              className={cn(
                "rounded-xl border bg-white p-4 transition",
                answering ? "border-emerald-300 ring-2 ring-emerald-50" : "border-slate-200",
              )}
            >
              <div className="flex items-start gap-3">
                <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-500">
                  {index + 1}
                </span>

                {/* min-w-0 so a long unbroken question shrinks instead of pushing
                    the buttons off the row — the flex default would let it. */}
                <AutoTextarea
                  value={row.question}
                  disabled={disabled || answering}
                  placeholder="Type a question…"
                  onChange={(e) => {
                    patch(index, { question: e.target.value, edited: true });
                    setDirty(true);
                  }}
                  className={cn(
                    "min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1",
                    "text-sm font-medium leading-relaxed text-slate-900 outline-none",
                    "hover:border-slate-200 focus:border-emerald-500 focus:bg-emerald-50/30",
                    "disabled:opacity-60",
                  )}
                />

                {/* Always visible, not revealed on hover. Re-answering is the
                    main thing anyone does here, and a control you have to
                    discover by accident is not one people use. */}
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    title={row.answer ? "Re-answer this question" : "Answer this question"}
                    aria-label={row.answer ? "Re-answer this question" : "Answer this question"}
                    disabled={disabled || busy}
                    onClick={() => regenerate(index)}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-40"
                  >
                    <RefreshCw className={cn("h-4 w-4", answering && "animate-spin")} />
                  </button>
                  <button
                    type="button"
                    title="Remove"
                    aria-label="Remove this question"
                    disabled={disabled || busy}
                    onClick={() => {
                      setRows((current) => current.filter((_, i) => i !== index));
                      setDirty(true);
                    }}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Indented to the question's text, so the pair reads as one block
                  and the eye has a single left edge to follow down the list. */}
              <div className="mt-2 pl-9 pr-2">
                {/* What tapping this question in WhatsApp says about the person.
                    Sits with the question rather than in the style panel because
                    it is a property of this one question, not of the list. */}
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  {FAQ_INTENTS.map((option) => {
                    const active = (row.intent ?? "none") === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        disabled={disabled || busy}
                        title={option.hint}
                        aria-pressed={active}
                        onClick={() => {
                          patch(index, { intent: option.value });
                          setDirty(true);
                        }}
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition disabled:opacity-50",
                          active
                            ? option.value === "buying"
                              ? "bg-emerald-600 text-white"
                              : option.value === "interest"
                                ? "bg-amber-500 text-white"
                                : "bg-slate-200 text-slate-700"
                            : "bg-white text-slate-500 ring-1 ring-inset ring-slate-200 hover:bg-slate-50",
                        )}
                      >
                        {option.label}
                        {active && FAQ_INTENT_POINTS[option.value] > 0 && (
                          <span className="ml-1 opacity-80">
                            +{FAQ_INTENT_POINTS[option.value]}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {answering ? (
                  <p className="flex items-center gap-2 text-sm text-slate-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Reading the {sources.length > 1 ? "documents" : "document"}…
                  </p>
                ) : row.answer ? (
                  <>
                    <p className="border-l-2 border-slate-100 pl-3 text-sm leading-relaxed text-slate-600">
                      {row.answer}
                    </p>
                    {showSources && row.source && (
                      <p className="mt-1.5 pl-3 text-xs text-slate-400">from {row.source}</p>
                    )}
                  </>
                ) : (
                  <p className="border-l-2 border-dashed border-slate-200 pl-3 text-sm italic text-slate-400">
                    Not answered yet — edit the question, then hit refresh.
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {visibleError && (
        <p className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{visibleError}</span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        {running ? (
          <button
            type="button"
            onClick={() => { cancelled.current = true; }}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            Stop
          </button>
        ) : (
          <>
            {/* Split control: the button generates, the select sets how many.
                One question and eight take the same path, so a top-up cannot
                come out written differently from the batch it joins. */}
            <div className="inline-flex overflow-hidden rounded-lg ring-1 ring-inset ring-emerald-200">
              <button
                type="button"
                disabled={disabled || busy}
                onClick={() => suggest(batch)}
                className="inline-flex items-center gap-2 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {rows.length === 0 ? `Generate ${batch} questions` : `Generate ${batch} more`}
              </button>
              <label className="sr-only" htmlFor="faq-batch">How many questions to generate</label>
              <select
                id="faq-batch"
                value={batch}
                disabled={disabled || busy}
                onChange={(e) => setBatch(Number(e.target.value))}
                className="cursor-pointer border-l border-emerald-200 bg-emerald-50 py-2 pl-2 pr-1 text-sm font-medium text-emerald-800 outline-none transition hover:bg-emerald-100 disabled:opacity-50"
              >
                {BATCH_SIZES.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            {/* The one-at-a-time button. A different intent from the batch: you
                are filling a gap you noticed, not asking what else is in there. */}
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => suggest(1)}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              One more
            </button>
          </>
        )}

        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => {
            setRows((current) => [...current, { question: "", answer: "" }]);
            setDirty(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
        >
          <PencilLine className="h-4 w-4" />
          Write my own
        </button>

        <button
          type="button"
          onClick={() => setShowStyle((v) => !v)}
          aria-expanded={showStyle}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
            showStyle || !isDefaultFaqStyle(style)
              ? "bg-slate-100 text-slate-900"
              : "text-slate-600 hover:bg-slate-100",
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Answer style
          {!isDefaultFaqStyle(style) && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
        </button>

        {dirty && (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={persist}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-[#0B6E4F] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#095c42] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving ? "Saving…" : "Save changes"}
          </button>
        )}
      </div>

      {showStyle && (
        <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Length</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {FAQ_LENGTHS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => editStyle({ length: option.value })}
                  aria-pressed={style.length === option.value}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                    style.length === option.value
                      ? "bg-[#0B6E4F] text-white"
                      : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-100",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              {FAQ_LENGTHS.find((l) => l.value === style.length)?.hint}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tone</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {FAQ_TONES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => editStyle({ tone: option.value })}
                  aria-pressed={style.tone === option.value}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                    style.tone === option.value
                      ? "bg-[#0B6E4F] text-white"
                      : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-100",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              className="text-xs font-semibold uppercase tracking-wide text-slate-500"
              htmlFor="faq-language"
            >
              Answer in
            </label>
            <input
              id="faq-language"
              value={style.language}
              onChange={(e) => editStyle({ language: e.target.value })}
              placeholder="Same language as the document"
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0B6E4F] focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              e.g. Hindi, Marathi. Names, prices and codes stay as written.
            </p>
          </div>

          <div className="sm:col-span-2">
            <label
              className="text-xs font-semibold uppercase tracking-wide text-slate-500"
              htmlFor="faq-audience"
            >
              Written for
            </label>
            <input
              id="faq-audience"
              value={style.audience}
              onChange={(e) => editStyle({ audience: e.target.value })}
              placeholder="Anyone asking"
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0B6E4F] focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              e.g. first-time buyers, existing customers chasing an order.
            </p>
          </div>

          <p className="text-xs text-slate-500 sm:col-span-2">
            Applies to answers generated from now on. Existing answers keep their wording until you
            re-answer them.
          </p>
        </div>
      )}

    </div>
  );
}
