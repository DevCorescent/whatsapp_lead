"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  FileText,
  Image as ImageIcon,
  LayoutList,
  MapPin,
  MessageSquare,
  Paperclip,
  Plus,
  Reply,
  Send,
  Smile,
  BookOpen,
  HelpCircle,
  Sparkles,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import type { MessageStatus } from "@prisma/client";
import { Avatar, Badge, Button, EmptyState, Skeleton, inputClass } from "@/components/ui";
import { CONVERSATION_STATUS_STYLE, cn, dayLabel, formatTime } from "@/lib/utils";
import { ATTACHMENT_ACCEPT, formatBytes } from "@/lib/attachments";
import { useSendMessage, useSetConversationAiActive } from "@/hooks/useMessages";
import type { InteractivePayload } from "@/lib/validators/message";
import { useQuickReplies, type QuickReply } from "@/hooks/useQuickReplies";
import { contactName, type InboxConversation, type InboxMessage } from "./ConversationList";
import { FaqMenuPicker } from "./FaqMenuPicker";
import { AttachmentDropOverlay } from "./AttachmentDropOverlay";
import { AttachmentPreviewModal } from "./AttachmentPreviewModal";
import { useAttachmentComposer } from "./useAttachmentComposer";

// Lazy-load the picker so its ~400 KB data bundle only downloads when the Smile
// button is first clicked, not on every inbox load.
const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * The page remounts this with `key={conversationId}`, so all composer state is
 * naturally per-conversation — no reset effects needed. Locally "sent" messages
 * live in the page instead, so they survive switching threads.
 */
export function ChatWindow({
  conversation,
  messages,
  localMessages,
  onSend,
  isLoading,
  isError,
  onBack,
  className,
}: {
  conversation: InboxConversation | null;
  messages: InboxMessage[];
  localMessages: InboxMessage[];
  onSend: (conversationId: string, message: InboxMessage) => void;
  isLoading?: boolean;
  isError?: boolean;
  onBack?: () => void;
  className?: string;
}) {
  const conversationId = conversation?.id ?? null;

  // Read, never held. `isAiActive` lives on the conversation row and reaches this component through
  // the React Query cache, so the switch reflects what is stored rather than what this component
  // last remembered. Copying it into `useState` was the bug: the inbox mounts this with
  // `key={selectedId}`, so that copy was discarded on every remount — a route change, a refresh, or
  // simply reopening the thread — and the switch fell back to whatever the initial render had seen.
  const aiActive = Boolean(conversation?.isAiActive);

  const [draft, setDraft] = useState("");
  const [isNote, setIsNote] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<InboxMessage | null>(null);
  const [showInteractive, setShowInteractive] = useState(false);
  const [interactiveType, setInteractiveType] = useState<"button" | "list">("button");
  const [interactiveBody, setInteractiveBody] = useState("");
  const [interactiveButtons, setInteractiveButtons] = useState<string[]>(["", ""]);
  const [interactiveListBtn, setInteractiveListBtn] = useState("Select an option");
  const [interactiveRows, setInteractiveRows] = useState<{title: string; description: string}[]>([{title: "", description: ""}]);

  // Quick replies expand from a "/shortcode" typed at the start of the composer. `qrDismissed`
  // exists so Escape can close the picker without also clearing what the agent has typed —
  // the draft still begins with "/", so without it the picker would immediately reopen.
  const [qrIndex, setQrIndex] = useState(0);
  const [qrDismissed, setQrDismissed] = useState(false);
  const quickRepliesQuery = useQuickReplies();
  const quickRepliesData = quickRepliesQuery.data;
  const quickReplies: QuickReply[] = useMemo(
    () => quickRepliesData?.data ?? [],
    [quickRepliesData],
  );

  const qrMatches = useMemo(() => {
    if (!draft.startsWith("/")) return [];
    const term = draft.slice(1).toLowerCase();
    // The whole draft is the search term, so a space means the agent has moved on to writing a
    // real message that merely happens to start with a slash.
    if (term.includes(" ")) return [];
    return quickReplies.filter((q) => q.shortcode.startsWith(term)).slice(0, 6);
  }, [draft, quickReplies]);

  const qrOpen = !qrDismissed && qrMatches.length > 0;

  const applyQuickReply = (reply: QuickReply) => {
    setDraft(reply.content);
    setQrDismissed(true);
    inputRef.current?.focus();
  };

  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);

  // Close emoji picker on outside click
  useEffect(() => {
    if (!showEmoji) return;
    const handler = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setShowEmoji(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showEmoji]);

  const [isAiGenerating, setIsAiGenerating] = useState(false);
  /**
   * Documents the current AI draft was grounded in.
   *
   * Held only while the draft is in the composer. Once sent it is an ordinary
   * agent message — a human read it, edited it and chose to send it, so it is
   * theirs, and citing the knowledge base under it would be attributing their
   * words to a document.
   */
  const [aiSources, setAiSources] = useState<string[]>([]);
  const [showFaqMenu, setShowFaqMenu] = useState(false);
  const sendMessage = useSendMessage();
  const setAiActive = useSetConversationAiActive();

  /**
   * Hand the change to the mutation and nothing else.
   *
   * There is deliberately no local write here. The mutation patches the cached conversation
   * optimistically and rolls that patch back if the request fails, so the switch responds instantly
   * while the cache stays the one thing describing this conversation's state.
   */
  function handleAiToggle(next: boolean) {
    if (!conversationId) return;
    setAiActive.mutate({ id: conversationId, isAiActive: next });
  }

  // All attachment behaviour (drag-and-drop, file picker, clipboard paste, preview and the
  // shared upload → send pipeline) lives in this hook so the composer stays a thin shell.
  const attach = useAttachmentComposer({ conversationId, onSend });

  const timeline = useMemo(() => {
    const all = [...messages, ...localMessages];
    all.sort((a, b) => msTime(a.createdAt) - msTime(b.createdAt));
    return all;
  }, [messages, localMessages]);

  // Follow the conversation as it grows (and land at the bottom on first paint).
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [timeline.length]);

  if (!conversation) {
    return (
      <div className={cn("flex min-w-0 flex-col items-center justify-center bg-slate-50", className)}>
        <EmptyState
          icon={MessageSquare}
          title="Select a conversation"
          description="Pick a thread from the list to read the history and reply."
        />
      </div>
    );
  }

  const name = contactName(conversation);
  const status = conversation.status ?? "OPEN";

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || !conversationId || sendMessage.isPending) return;
    setSendError(null);

    try {
      await sendMessage.mutateAsync({
        conversationId,
        content,
        type: "TEXT",
        isNote,
        replyToId: replyTo?.id,
      });
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Failed to send message");
      return;
    }
    setDraft("");
    setAiSources([]);
    setShowEmoji(false);
    setReplyTo(null);
  }

  async function handleSendInteractive() {
    if (!conversationId || sendMessage.isPending) return;
    setSendError(null);

    const body = interactiveBody.trim();
    if (!body) { setSendError("Body text is required"); return; }

    let interactive: InteractivePayload;
    if (interactiveType === "button") {
      const validBtns = interactiveButtons.map((b, i) => b.trim()).filter(Boolean);
      if (validBtns.length === 0) { setSendError("Add at least one button"); return; }
      interactive = {
        type: "button",
        body: { text: body },
        action: {
          buttons: validBtns.map((title, i) => ({ type: "reply" as const, reply: { id: `btn_${i}`, title } })),
        },
      };
    } else {
      const validRows = interactiveRows.filter((r) => r.title.trim());
      if (validRows.length === 0) { setSendError("Add at least one list option"); return; }
      interactive = {
        type: "list",
        body: { text: body },
        action: {
          button: interactiveListBtn.trim() || "Select an option",
          sections: [{ rows: validRows.map((r, i) => ({ id: `row_${i}`, title: r.title.trim(), ...(r.description.trim() ? { description: r.description.trim() } : {}) })) }],
        },
      };
    }

    try {
      await sendMessage.mutateAsync({
        conversationId,
        type: "INTERACTIVE",
        interactive,
        replyToId: replyTo?.id,
      });
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Failed to send interactive message");
      return;
    }
    setShowInteractive(false);
    setInteractiveBody("");
    setInteractiveButtons(["", ""]);
    setInteractiveRows([{ title: "", description: "" }]);
    setReplyTo(null);
  }

  function insertEmoji(emoji: string) {
    setDraft((d) => d + emoji);
    setShowEmoji(false);
    inputRef.current?.focus();
  }

  async function handleAiSuggest() {
    if (!conversationId || isAiGenerating) return;
    setIsAiGenerating(true);
    setDraft("");
    setAiSources([]);

    try {
      const res = await fetch("/api/ai/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "AI reply failed");
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") break;
          try {
            const parsed = JSON.parse(payload) as {
              chunk?: string;
              error?: string;
              sources?: { name?: string }[];
            };
            if (parsed.error) throw new Error(parsed.error);
            // Arrives on its own frame ahead of the first token, so the agent can
            // see what the draft is grounded in while it is still being written.
            if (parsed.sources) {
              setAiSources(parsed.sources.map((s) => s?.name ?? "").filter(Boolean));
            }
            if (parsed.chunk) setDraft((d) => d + parsed.chunk);
          } catch {
            // ignore malformed SSE frames
          }
        }
      }

      inputRef.current?.focus();
    } catch (err) {
      setDraft(err instanceof Error ? `⚠️ ${err.message}` : "⚠️ AI reply failed");
    } finally {
      setIsAiGenerating(false);
    }
  }

  return (
    <div className={cn("flex min-w-0 flex-col bg-slate-50", className)}>
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 py-2.5 lg:px-4">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to conversations"
            className="-ml-1 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}

        <Avatar name={name} src={conversation.contact?.avatarUrl} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
            <Badge className={cn("hidden sm:inline-flex", CONVERSATION_STATUS_STYLE[status])}>
              {String(status).toLowerCase()}
            </Badge>
          </div>
          <p className="truncate text-xs text-slate-500">
            {conversation.contact?.phone ?? "No phone on file"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden text-xs font-medium text-slate-600 sm:inline">AI Auto-Reply</span>
          <Sparkles
            className={cn("h-4 w-4 sm:hidden", aiActive ? "text-emerald-600" : "text-slate-400")}
          />
          <Switch
            checked={aiActive}
            onChange={handleAiToggle}
            label="Toggle AI auto-reply for this conversation"
          />
        </div>
      </header>

      {/* Opted-out banner */}
      {conversation.contact?.optedOut && (
        <div className="flex items-center gap-2 border-b border-rose-200 bg-rose-50 px-4 py-2 text-xs font-medium text-rose-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          This contact has opted out (sent STOP). Messages will not be delivered. They can re-subscribe by texting START.
        </div>
      )}

      {/* Messages */}
      <div
        className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-3 py-4 lg:px-6"
        style={{
          backgroundImage: "radial-gradient(#e2e8f0 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      >
        {isLoading ? (
          <MessageSkeleton />
        ) : isError && timeline.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={AlertCircle}
              title="Messages unavailable"
              description="We couldn't load this thread. It will fill in once the messages service is live."
            />
          </div>
        ) : timeline.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={MessageSquare}
              title="No messages yet"
              description={`Say hello to ${name} — your reply starts the thread.`}
            />
          </div>
        ) : (
          <ul className="space-y-1.5">
            {timeline.map((message, i) => {
              const prev = timeline[i - 1];
              const showDay = !prev || dayLabel(prev.createdAt) !== dayLabel(message.createdAt);
              const quotedMessage = message.replyToId
                ? timeline.find((m) => m.id === message.replyToId) ?? null
                : null;
              return (
                <li key={message.id}>
                  {showDay && (
                    <div className="my-4 flex justify-center">
                      <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-slate-500 shadow-sm ring-1 ring-slate-200">
                        {dayLabel(message.createdAt)}
                      </span>
                    </div>
                  )}
                  <MessageBubble
                    message={message}
                    quotedMessage={quotedMessage}
                    onReply={conversation.contact?.optedOut ? undefined : () => setReplyTo(message)}
                  />
                </li>
              );
            })}
          </ul>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer — `relative` so the drop overlay highlights only this region. */}
      <div
        className="relative shrink-0 border-t border-slate-200 bg-white px-3 py-3 lg:px-4"
        onDragEnter={attach.dragHandlers.onDragEnter}
        onDragOver={attach.dragHandlers.onDragOver}
        onDragLeave={attach.dragHandlers.onDragLeave}
        onDrop={attach.dragHandlers.onDrop}
      >
        <AttachmentDropOverlay visible={attach.isDragging} />

        {/* Reply-to strip */}
        {replyTo && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <Reply className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-emerald-700">
                {replyTo.direction === "OUTBOUND" ? "Replying to yourself" : "Replying to customer"}
              </p>
              <p className="truncate text-xs text-slate-500">
                {replyTo.content || (replyTo.type === "INTERACTIVE" ? "Interactive message" : `[${replyTo.type?.toLowerCase()}]`)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              aria-label="Cancel reply"
              className="rounded p-0.5 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Interactive message composer */}
        {showInteractive && (
          <div className="mb-3 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-emerald-800">Interactive Message</p>
              <button type="button" onClick={() => setShowInteractive(false)} className="rounded p-0.5 text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex gap-2">
              {(["button", "list"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setInteractiveType(t)}
                  className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition capitalize",
                    interactiveType === t ? "bg-emerald-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                  )}>{t}</button>
              ))}
            </div>
            <textarea
              rows={2}
              value={interactiveBody}
              onChange={(e) => setInteractiveBody(e.target.value)}
              placeholder="Body text sent to the customer…"
              className={cn(inputClass, "resize-none")}
            />
            {interactiveType === "button" ? (
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-slate-500">Buttons (max 3, max 20 chars each)</p>
                {interactiveButtons.map((btn, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input
                      value={btn}
                      maxLength={20}
                      onChange={(e) => setInteractiveButtons((prev) => prev.map((b, j) => j === i ? e.target.value : b))}
                      placeholder={`Button ${i + 1}`}
                      className={cn(inputClass, "flex-1 py-1.5 text-sm")}
                    />
                    {interactiveButtons.length > 1 && (
                      <button type="button" onClick={() => setInteractiveButtons((prev) => prev.filter((_, j) => j !== i))}
                        className="rounded p-1 text-slate-400 hover:text-rose-500">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {interactiveButtons.length < 3 && (
                  <button type="button" onClick={() => setInteractiveButtons((prev) => [...prev, ""])}
                    className="flex items-center gap-1 text-xs text-emerald-700 hover:underline">
                    <Plus className="h-3 w-3" /> Add button
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-slate-500">Menu button label</p>
                <input value={interactiveListBtn} maxLength={20} onChange={(e) => setInteractiveListBtn(e.target.value)}
                  placeholder="Select an option" className={cn(inputClass, "py-1.5 text-sm")} />
                <p className="text-[11px] font-medium text-slate-500">List options</p>
                {interactiveRows.map((row, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <div className="flex-1 space-y-1">
                      <input value={row.title} maxLength={24} onChange={(e) => setInteractiveRows((prev) => prev.map((r, j) => j === i ? {...r, title: e.target.value} : r))}
                        placeholder={`Option ${i + 1} title`} className={cn(inputClass, "py-1.5 text-sm")} />
                      <input value={row.description} maxLength={72} onChange={(e) => setInteractiveRows((prev) => prev.map((r, j) => j === i ? {...r, description: e.target.value} : r))}
                        placeholder="Description (optional)" className={cn(inputClass, "py-1.5 text-sm")} />
                    </div>
                    {interactiveRows.length > 1 && (
                      <button type="button" onClick={() => setInteractiveRows((prev) => prev.filter((_, j) => j !== i))}
                        className="mt-1 rounded p-1 text-slate-400 hover:text-rose-500">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {interactiveRows.length < 10 && (
                  <button type="button" onClick={() => setInteractiveRows((prev) => [...prev, {title: "", description: ""}])}
                    className="flex items-center gap-1 text-xs text-emerald-700 hover:underline">
                    <Plus className="h-3 w-3" /> Add option
                  </button>
                )}
              </div>
            )}
            <Button size="sm" onClick={handleSendInteractive} disabled={sendMessage.isPending || !interactiveBody.trim()}>
              {sendMessage.isPending ? <Clock className="h-3.5 w-3.5 animate-pulse" /> : <Send className="h-3.5 w-3.5" />}
              Send interactive
            </Button>
          </div>
        )}

        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsNote((v) => !v)}
            role="switch"
            aria-checked={isNote}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition",
              isNote
                ? "bg-amber-100 text-amber-800 ring-amber-300"
                : "text-slate-500 ring-slate-200 hover:bg-slate-50",
            )}
          >
            <StickyNote className="h-3.5 w-3.5" />
            Internal note
          </button>
          {isNote && (
            <span className="text-[11px] text-amber-700">
              Only your team can see this — it is not sent to WhatsApp.
            </span>
          )}
        </div>

        <form onSubmit={handleSend} className="relative flex items-end gap-2">
          <div className="relative flex shrink-0 items-center gap-0.5">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT}
              className="hidden"
              onChange={(e) => {
                attach.addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <ComposerIcon
              icon={Paperclip}
              label="Attach a file"
              onClick={() => fileRef.current?.click()}
            />
            <ComposerIcon
              icon={Smile}
              label="Insert emoji"
              active={showEmoji}
              onClick={() => setShowEmoji((v) => !v)}
            />
            <ComposerIcon
              icon={Sparkles}
              label={isAiGenerating ? "Generating…" : "AI Suggest a reply"}
              onClick={handleAiSuggest}
              disabled={isAiGenerating}
              className={cn("text-emerald-600 hover:bg-emerald-50", isAiGenerating && "animate-pulse")}
            />
            <ComposerIcon
              icon={HelpCircle}
              label="Send a FAQ question menu"
              active={showFaqMenu}
              onClick={() => setShowFaqMenu((v) => !v)}
              className="text-emerald-600 hover:bg-emerald-50"
            />
            {showFaqMenu && conversationId && (
              <FaqMenuPicker
                conversationId={conversationId}
                onClose={() => setShowFaqMenu(false)}
              />
            )}
            <ComposerIcon
              icon={LayoutList}
              label="Send interactive message (buttons or list)"
              active={showInteractive}
              onClick={() => setShowInteractive((v) => !v)}
              className="text-emerald-600 hover:bg-emerald-50"
            />

            {showEmoji && (
              <div ref={emojiRef} className="absolute bottom-11 left-0 z-30">
                <EmojiPicker
                  onEmojiClick={(e) => { insertEmoji(e.emoji); setShowEmoji(false); }}
                  lazyLoadEmojis
                  skinTonesDisabled
                  searchPlaceholder="Search emoji…"
                  height={380}
                  width={320}
                />
              </div>
            )}
          </div>

          {qrOpen && (
            <div className="absolute bottom-14 left-3 right-3 z-20 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
              <p className="border-b border-slate-100 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Quick replies
              </p>
              {qrMatches.map((reply, index) => (
                <button
                  key={reply.id}
                  type="button"
                  // onMouseDown, not onClick: the input blurs before a click lands, and the blur
                  // handler closes the picker — the button would be gone before it ever fired.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyQuickReply(reply);
                  }}
                  onMouseEnter={() => setQrIndex(index)}
                  className={cn(
                    "flex w-full flex-col gap-0.5 px-3 py-2 text-left",
                    index === qrIndex ? "bg-emerald-50" : "hover:bg-slate-50",
                  )}
                >
                  <span className="text-xs font-semibold text-emerald-700">/{reply.shortcode}</span>
                  <span className="line-clamp-2 text-xs text-slate-600">{reply.content}</span>
                </button>
              ))}
            </div>
          )}

          {aiSources.length > 0 && draft && (
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] text-slate-500">
              <BookOpen className="h-3 w-3 shrink-0 text-emerald-600" />
              Drafted from {aiSources.join(", ")}
            </p>
          )}

          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setSendError(null);
              setQrDismissed(false);
              setQrIndex(0);
            }}
            onKeyDown={(e) => {
              if (!qrOpen) return;
              // While the picker is open it owns these keys — Enter in particular, which would
              // otherwise submit the form and send the raw "/shortcode" as the message.
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setQrIndex((i) => (i + 1) % qrMatches.length);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setQrIndex((i) => (i - 1 + qrMatches.length) % qrMatches.length);
              } else if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                applyQuickReply(qrMatches[qrIndex] ?? qrMatches[0]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setQrDismissed(true);
              }
            }}
            onBlur={() => setQrDismissed(true)}
            onPaste={attach.onPaste}
            placeholder={isNote ? "Write an internal note…" : "Type a message"}
            aria-label={isNote ? "Internal note" : "Message"}
            className={cn(
              "min-w-0 flex-1 rounded-full border px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2",
              isNote
                ? "border-amber-300 bg-amber-50 placeholder:text-amber-600/70 focus:border-amber-400 focus:ring-amber-500/20"
                : "border-slate-200 bg-slate-50 focus:border-emerald-500 focus:bg-white focus:ring-emerald-500/20",
            )}
          />

          <Button
            type="submit"
            disabled={!draft.trim() || sendMessage.isPending}
            aria-label="Send message"
            className={cn(
              "h-10 w-10 shrink-0 rounded-full p-0",
              isNote && "bg-amber-500 hover:bg-amber-600",
            )}
          >
            {sendMessage.isPending ? (
              <Clock className="h-4 w-4 animate-pulse" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>

        {sendError && (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" aria-hidden />
            <span className="flex-1 leading-snug">{sendError}</span>
            <button
              type="button"
              onClick={() => setSendError(null)}
              className="shrink-0 text-rose-400 hover:text-rose-600"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Review step for dropped / picked / pasted files. Renders only when files are staged. */}
      <AttachmentPreviewModal
        items={attach.items}
        caption={attach.caption}
        onCaptionChange={attach.setCaption}
        isNote={isNote}
        isUploading={attach.isUploading}
        progress={attach.progress}
        uploadError={attach.uploadError}
        errors={attach.errors}
        onRemove={attach.removeItem}
        onMove={attach.moveItem}
        onCancelUpload={attach.cancelUpload}
        onDiscard={attach.clear}
        onSend={() => attach.send({ isNote })}
      />
    </div>
  );
}

// ─── Bubbles ──────────────────────────────────────────────────────────────────

function MessageBubble({
  message,
  quotedMessage,
  onReply,
}: {
  message: InboxMessage;
  quotedMessage?: InboxMessage | null;
  onReply?: () => void;
}) {
  const outbound = message.direction === "OUTBOUND";

  if (message.isNote) {
    return (
      <div className="my-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <Badge className="bg-amber-100 text-amber-800 ring-amber-600/20">
            <StickyNote className="mr-1 h-3 w-3" />
            Note
          </Badge>
          {message.sentBy?.name && (
            <span className="truncate text-[11px] font-medium text-amber-800">
              {message.sentBy.name}
            </span>
          )}
          <span className="ml-auto shrink-0 text-[11px] text-amber-700/70">
            {formatTime(message.createdAt)}
          </span>
        </div>
        <MessageBody message={message} tone="note" />
      </div>
    );
  }

  const replyBtn = onReply && (
    <button
      type="button"
      onClick={onReply}
      title="Reply"
      aria-label="Reply to this message"
      className="mb-1 shrink-0 rounded-full p-1.5 text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100"
    >
      <Reply className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <div className={cn("group flex items-end gap-1", outbound ? "justify-end" : "justify-start")}>
      {!outbound && replyBtn}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 shadow-sm sm:max-w-[70%]",
          outbound
            ? "rounded-br-sm bg-emerald-600 text-white"
            : "rounded-bl-sm border border-slate-200 bg-white text-slate-800",
        )}
      >
        {quotedMessage && (
          <div
            className={cn(
              "mb-2 rounded-lg border-l-[3px] px-2 py-1.5",
              outbound ? "border-white/40 bg-white/10" : "border-emerald-500 bg-slate-50",
            )}
          >
            <p className={cn("mb-0.5 text-[10px] font-semibold", outbound ? "text-white/70" : "text-emerald-700")}>
              {quotedMessage.direction === "OUTBOUND" ? "You" : "Customer"}
            </p>
            <p className={cn("truncate text-xs", outbound ? "text-white/80" : "text-slate-600")}>
              {quotedMessage.content ||
                (quotedMessage.type === "INTERACTIVE"
                  ? "Interactive message"
                  : `[${quotedMessage.type?.toLowerCase() ?? "message"}]`)}
            </p>
          </div>
        )}

        {message.isAiGenerated && (
          <span
            className={cn(
              "mb-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              outbound ? "bg-white/20 text-white" : "bg-violet-50 text-violet-700",
            )}
          >
            <Sparkles className="h-3 w-3" />
            AI
          </span>
        )}

        <MessageBody message={message} tone={outbound ? "outbound" : "inbound"} />

        <KnowledgeCitation message={message} outbound={outbound} />

        <div
          className={cn(
            "mt-1 flex items-center justify-end gap-1",
            outbound ? "text-emerald-50/80" : "text-slate-400",
          )}
        >
          <span className="text-[10px]">{formatTime(message.createdAt)}</span>
          {outbound && <StatusTick status={message.status} />}
        </div>
      </div>
      {outbound && replyBtn}
    </div>
  );
}

/**
 * Which knowledge documents an AI reply was grounded in.
 *
 * Recorded on the message at send time (see saveOutboundMessage in lib/inbound.ts)
 * rather than looked up now: retrieval depends on the index as it stood at that
 * moment, so re-running the search after a document was edited or deleted would
 * answer a different question.
 *
 * Shown because an AI reply is otherwise unattributable. When one turns out to be
 * wrong, the useful question is which of the workspace's documents told it that —
 * and without this line the answer is unavailable to anyone.
 */
function KnowledgeCitation({
  message,
  outbound,
}: {
  message: InboxMessage;
  outbound: boolean;
}) {
  const raw = (message.metadata as { knowledgeSources?: unknown } | null | undefined)
    ?.knowledgeSources;
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const names = raw
    .map((s) => (s && typeof s === "object" ? String((s as { name?: unknown }).name ?? "") : ""))
    .filter(Boolean);
  if (names.length === 0) return null;

  return (
    <p
      className={cn(
        "mt-1.5 border-t pt-1.5 text-[10px] leading-relaxed",
        outbound ? "border-white/20 text-white/70" : "border-slate-100 text-slate-400",
      )}
      title={names.join(", ")}
    >
      <BookOpen className="mr-1 inline h-3 w-3 align-[-2px]" />
      Answered from {names.join(", ")}
    </p>
  );
}

function MessageBody({
  message,
  tone,
}: {
  message: InboxMessage;
  tone: "inbound" | "outbound" | "note";
}) {
  const outbound = tone === "outbound";
  const caption = message.content?.trim();
  const meta = message.metadata ?? {};

  switch (message.type) {
    case "IMAGE":
    case "STICKER":
      return (
        <div className="space-y-1.5">
          {message.mediaUrl ? (
            <ImageBubble src={message.mediaUrl} alt={caption || "Attached image"} />
          ) : (
            <MediaChip icon={ImageIcon} label="Image unavailable" outbound={outbound} />
          )}
          {caption && <p className="whitespace-pre-wrap wrap-break-word text-sm">{caption}</p>}
        </div>
      );

    case "VIDEO":
      return (
        <div className="space-y-1.5">
          {message.mediaUrl ? (
            <video
              src={message.mediaUrl}
              controls
              className="max-h-64 w-full max-w-xs rounded-lg bg-black"
            />
          ) : (
            <MediaChip icon={ImageIcon} label="Video unavailable" outbound={outbound} />
          )}
          {caption && <p className="whitespace-pre-wrap wrap-break-word text-sm">{caption}</p>}
        </div>
      );

    case "AUDIO":
      return message.mediaUrl ? (
        <audio src={message.mediaUrl} controls className="h-9 w-56 max-w-full" />
      ) : (
        <MediaChip icon={FileText} label="Voice message" outbound={outbound} />
      );

    case "DOCUMENT": {
      const filename = str(meta.filename) ?? caption ?? "Document";
      const size = message.mediaSize ? formatBytes(message.mediaSize) : null;
      const chip = (
        <span
          className={cn(
            "inline-flex max-w-full items-center gap-2 rounded-lg px-2.5 py-2 ring-1 ring-inset",
            outbound ? "bg-white/10 ring-white/25" : "bg-slate-50 ring-slate-200",
          )}
        >
          <FileText className="h-5 w-5 shrink-0" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{filename}</span>
            {size && (
              <span className={cn("block text-[11px]", outbound ? "text-white/70" : "text-slate-500")}>
                {size}
              </span>
            )}
          </span>
        </span>
      );
      return message.mediaUrl ? (
        <a href={message.mediaUrl} target="_blank" rel="noreferrer" className="block">
          {chip}
        </a>
      ) : (
        chip
      );
    }

    case "LOCATION": {
      const lat = num(meta.latitude);
      const lng = num(meta.longitude);
      const label =
        caption || (lat != null && lng != null ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : "Shared a location");
      const chip = <MediaChip icon={MapPin} label={label} outbound={outbound} />;
      return lat != null && lng != null ? (
        <a
          href={`https://maps.google.com/?q=${lat},${lng}`}
          target="_blank"
          rel="noreferrer"
          className="block"
        >
          {chip}
        </a>
      ) : (
        chip
      );
    }

    case "INTERACTIVE": {
      const interactive = meta.interactive as Record<string, unknown> | undefined;
      const bodyText = caption || (interactive?.body as { text?: string } | undefined)?.text;

      if (interactive?.type === "button") {
        const buttons =
          (interactive.action as { buttons?: Array<{ reply?: { title?: string } }> } | undefined)?.buttons ?? [];
        return (
          <div className="space-y-2">
            {bodyText && <p className="whitespace-pre-wrap wrap-break-word text-sm">{bodyText}</p>}
            <div className="flex flex-wrap gap-1.5">
              {buttons.map((btn, i) => (
                <span
                  key={i}
                  className={cn(
                    "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset",
                    outbound
                      ? "bg-white/15 text-white ring-white/30"
                      : "bg-emerald-50 text-emerald-800 ring-emerald-200",
                  )}
                >
                  {btn.reply?.title ?? `Button ${i + 1}`}
                </span>
              ))}
            </div>
          </div>
        );
      }

      if (interactive?.type === "list") {
        const menuLabel =
          (interactive.action as { button?: string } | undefined)?.button ?? "View options";
        return (
          <div className="space-y-2">
            {bodyText && <p className="whitespace-pre-wrap wrap-break-word text-sm">{bodyText}</p>}
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset",
                outbound
                  ? "bg-white/15 text-white ring-white/30"
                  : "bg-emerald-50 text-emerald-800 ring-emerald-200",
              )}
            >
              <LayoutList className="h-3 w-3" />
              {menuLabel}
            </span>
          </div>
        );
      }

      return (
        <p className="whitespace-pre-wrap wrap-break-word text-sm">
          {bodyText || <span className="italic opacity-70">Interactive message</span>}
        </p>
      );
    }

    default:
      return (
        <p className="whitespace-pre-wrap wrap-break-word text-sm">
          {caption || <span className="italic opacity-70">Empty message</span>}
        </p>
      );
  }
}

function MediaChip({
  icon: Icon,
  label,
  outbound,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  outbound: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm ring-1 ring-inset",
        outbound ? "bg-white/10 ring-white/25" : "bg-slate-50 ring-slate-200",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** An image bubble that opens a full-screen lightbox on click (Enter/Space) and ESC to close. */
function ImageBubble({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Open image: ${alt}`}
        className="block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="max-h-64 w-full max-w-xs cursor-zoom-in rounded-lg object-cover"
        />
      </button>
      {open && <Lightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close image"
        className="absolute right-4 top-4 rounded-lg p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
      >
        <X className="h-5 w-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] max-w-full rounded-lg object-contain shadow-2xl"
      />
    </div>
  );
}

function StatusTick({ status }: { status?: MessageStatus | null }) {
  switch (status) {
    case "READ":
      return <CheckCheck className="h-3.5 w-3.5 text-sky-300" aria-label="Read" />;
    case "DELIVERED":
      return <CheckCheck className="h-3.5 w-3.5" aria-label="Delivered" />;
    case "SENT":
      return <Check className="h-3.5 w-3.5" aria-label="Sent" />;
    case "FAILED":
      return <AlertCircle className="h-3.5 w-3.5 text-rose-300" aria-label="Failed to send" />;
    case "PENDING":
      return <Clock className="h-3.5 w-3.5" aria-label="Pending" />;
    default:
      return null;
  }
}

// ─── Bits ─────────────────────────────────────────────────────────────────────

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
        checked ? "bg-emerald-600" : "bg-slate-300",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full bg-white shadow transition",
          checked ? "translate-x-4.5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function ComposerIcon({
  icon: Icon,
  label,
  onClick,
  active,
  disabled,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      disabled={disabled}
      className={cn(
        "rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
        active && "bg-slate-100 text-slate-700",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

function MessageSkeleton() {
  const widths = ["w-40", "w-56", "w-32", "w-64", "w-44"];
  return (
    <div className="space-y-4">
      {widths.map((w, i) => (
        <div key={i} className={cn("flex", i % 2 ? "justify-end" : "justify-start")}>
          <Skeleton className={cn("h-12 rounded-2xl", w)} />
        </div>
      ))}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function msTime(date?: string | Date | null) {
  if (!date) return 0;
  const t = new Date(date).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function str(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
