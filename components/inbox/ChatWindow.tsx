"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  FileText,
  Image as ImageIcon,
  MapPin,
  MessageSquare,
  Paperclip,
  Send,
  Smile,
  Sparkles,
  StickyNote,
  X,
} from "lucide-react";
import type { MessageStatus } from "@prisma/client";
import { Avatar, Badge, Button, EmptyState, Skeleton } from "@/components/ui";
import { CONVERSATION_STATUS_STYLE, cn, dayLabel, formatTime } from "@/lib/utils";
import { ATTACHMENT_ACCEPT, formatBytes } from "@/lib/attachments";
import { useAiReply } from "@/hooks/useMessages";
import { contactName, type InboxConversation, type InboxMessage } from "./ConversationList";
import { AttachmentDropOverlay } from "./AttachmentDropOverlay";
import { AttachmentPreviewModal } from "./AttachmentPreviewModal";
import { useAttachmentComposer } from "./useAttachmentComposer";

const EMOJIS = ["👍", "🙏", "😊", "🎉", "🔥", "✅", "❤️", "😂", "🤝", "📞", "📄", "⏰", "💰", "🚀", "👀", "🙌"];

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

  const [aiActive, setAiActive] = useState(Boolean(conversation?.isAiActive));
  const [draft, setDraft] = useState("");
  const [isNote, setIsNote] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const aiReply = useAiReply();

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

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || !conversationId) return;

    // TODO [GAURANSH]: wire POST /api/messages — { conversationId, content, type, isNote }.
    // Until then the message only lands in this local optimistic list.
    const optimistic: InboxMessage = {
      id: `local-${Date.now()}`,
      type: "TEXT",
      direction: "OUTBOUND",
      content,
      status: "SENT",
      isNote,
      isAiGenerated: false,
      createdAt: new Date().toISOString(),
    };

    onSend(conversationId, optimistic);
    setDraft("");
    setShowEmoji(false);
  }

  function insertEmoji(emoji: string) {
    setDraft((d) => d + emoji);
    setShowEmoji(false);
    inputRef.current?.focus();
  }

  async function handleAiSuggest() {
    if (!conversationId || aiReply.isPending) return;
    try {
      const res = await aiReply.mutateAsync(conversationId);
      const reply = (res as { data?: { reply?: string } })?.data?.reply;
      if (reply) setDraft(reply);
      inputRef.current?.focus();
    } catch (err) {
      setDraft(err instanceof Error ? `⚠️ ${err.message}` : "⚠️ AI reply failed");
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
            onChange={setAiActive}
            label="Toggle AI auto-reply for this conversation"
          />
        </div>
      </header>

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
              return (
                <li key={message.id}>
                  {showDay && (
                    <div className="my-4 flex justify-center">
                      <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-slate-500 shadow-sm ring-1 ring-slate-200">
                        {dayLabel(message.createdAt)}
                      </span>
                    </div>
                  )}
                  <MessageBubble message={message} />
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

        <form onSubmit={handleSend} className="flex items-end gap-2">
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
              label="AI Suggest a reply"
              onClick={handleAiSuggest}
              className="text-emerald-600 hover:bg-emerald-50"
            />

            {showEmoji && (
              <div className="absolute bottom-11 left-0 z-10 grid w-56 grid-cols-8 gap-0.5 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => insertEmoji(emoji)}
                    className="rounded p-1 text-base leading-none hover:bg-slate-100"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
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
            disabled={!draft.trim()}
            aria-label="Send message"
            className={cn(
              "h-10 w-10 shrink-0 rounded-full p-0",
              isNote && "bg-amber-500 hover:bg-amber-600",
            )}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
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

function MessageBubble({ message }: { message: InboxMessage }) {
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

  return (
    <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 shadow-sm sm:max-w-[70%]",
          outbound
            ? "rounded-br-sm bg-emerald-600 text-white"
            : "rounded-bl-sm border border-slate-200 bg-white text-slate-800",
        )}
      >
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
    </div>
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
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
        active && "bg-slate-100 text-slate-700",
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
