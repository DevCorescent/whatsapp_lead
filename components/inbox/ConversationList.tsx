"use client";

import { MessageSquare, Search, SearchX, WifiOff } from "lucide-react";
import type {
  ConversationStatus,
  LeadScoreLabel,
  MessageDirection,
  MessageStatus,
  MessageType,
} from "@prisma/client";
import { Avatar, EmptyState, Skeleton } from "@/components/ui";
import { cn, timeAgo } from "@/lib/utils";

// ─── Shared inbox types ───────────────────────────────────────────────────────
// The API routes are still 501 stubs, so nothing about the payload shape is
// guaranteed yet. Every field the UI does not strictly need is optional and the
// components read defensively — a half-populated row must still render.

export interface InboxTag {
  id: string;
  name: string;
  color?: string | null;
}

export interface InboxAgent {
  id: string;
  name?: string | null;
  avatar?: string | null;
}

export interface InboxLead {
  id: string;
  title?: string | null;
  /** Dynamic pipeline stage relation, as included by the lead APIs. */
  stage?: { id?: string | null; name?: string | null; color?: string | null } | null;
  score?: number | null;
  scoreLabel?: LeadScoreLabel | null;
  value?: number | null;
  currency?: string | null;
}

export interface InboxContact {
  id: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  avatarUrl?: string | null;
  /** Prisma returns the join rows (`{ tag: {...} }`); a flattened list is accepted too. */
  tags?: Array<InboxTag | { tag?: InboxTag | null }> | null;
  leads?: InboxLead[] | null;
}

export interface InboxMessage {
  id: string;
  type?: MessageType | null;
  direction?: MessageDirection | null;
  content?: string | null;
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
  mediaSize?: number | null;
  metadata?: Record<string, unknown> | null;
  status?: MessageStatus | null;
  isNote?: boolean | null;
  isAiGenerated?: boolean | null;
  createdAt?: string | Date | null;
  sentBy?: InboxAgent | null;
}

export interface InboxConversation {
  id: string;
  status?: ConversationStatus | null;
  channel?: string | null;
  isAiActive?: boolean | null;
  unreadCount?: number | null;
  labels?: string[] | null;
  lastMessageAt?: string | Date | null;
  lastMessagePreview?: string | null;
  createdAt?: string | Date | null;
  contact?: InboxContact | null;
  assignedToId?: string | null;
  assignedTo?: InboxAgent | null;
  lead?: InboxLead | null;
  messages?: InboxMessage[] | null;
}

export type InboxTab = "all" | "open" | "assigned" | "resolved" | "mine";

export const INBOX_TABS: { id: InboxTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "assigned", label: "Assigned" },
  { id: "resolved", label: "Resolved" },
  { id: "mine", label: "Mine" },
];

/** Contact tags come back either flattened or as Prisma join rows — take both. */
export function contactTags(contact?: InboxContact | null): InboxTag[] {
  const raw = contact?.tags;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      if ("tag" in entry) return entry.tag ?? null;
      return entry as InboxTag;
    })
    .filter((t): t is InboxTag => Boolean(t && t.id));
}

export function contactName(conversation?: InboxConversation | null) {
  return conversation?.contact?.name?.trim() || conversation?.contact?.phone || "Unknown contact";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  isLoading,
  isError,
  search,
  onSearchChange,
  tab,
  onTabChange,
  className,
}: {
  conversations: InboxConversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isLoading?: boolean;
  isError?: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  tab: InboxTab;
  onTabChange: (tab: InboxTab) => void;
  className?: string;
}) {
  const hasQuery = search.trim().length > 0;

  return (
    <div className={cn("flex min-h-0 flex-col border-r border-slate-200 bg-white", className)}>
      {/* Search */}
      <div className="shrink-0 border-b border-slate-100 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
            className="w-full rounded-lg bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 ring-1 ring-inset ring-transparent transition placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Filter tabs. Five of these have to survive a 320px column, so the
            padding is tight enough that "Mine" isn't clipped off the end. */}
        <div
          role="tablist"
          aria-label="Filter conversations"
          className="scrollbar-slim mt-3 flex gap-0.5 overflow-x-auto"
        >
          {INBOX_TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => onTabChange(t.id)}
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1.5 text-xs font-medium transition",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
                  active
                    ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/25"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-700",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Rows */}
      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <ul className="divide-y divide-slate-100">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-3.5">
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-3 w-2/5" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              </li>
            ))}
          </ul>
        ) : isError ? (
          <EmptyState
            icon={WifiOff}
            title="Can't load conversations"
            description="The inbox service isn't responding yet. Your WhatsApp threads will show up here as soon as it's live."
          />
        ) : conversations.length === 0 ? (
          hasQuery ? (
            <EmptyState
              icon={SearchX}
              title="No matches"
              description={`Nothing matched "${search.trim()}". Try a different name, phone number or keyword.`}
            />
          ) : (
            <EmptyState
              icon={MessageSquare}
              title="No conversations yet"
              description="Incoming WhatsApp messages will appear here."
            />
          )
        ) : (
          <ul className="divide-y divide-slate-100">
            {conversations.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                selected={c.id === selectedId}
                onSelect={onSelect}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ConversationRow({
  conversation,
  selected,
  onSelect,
}: {
  conversation: InboxConversation;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const name = contactName(conversation);
  const unread = conversation.unreadCount ?? 0;
  const labels = conversation.labels ?? [];
  const preview = conversation.lastMessagePreview?.trim() || "No messages yet";

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(conversation.id)}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "relative flex w-full items-start gap-3 px-3 py-3 text-left transition",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600",
          selected ? "bg-emerald-50" : "hover:bg-slate-50",
        )}
      >
        {selected && <span className="absolute inset-y-0 left-0 w-0.5 bg-emerald-600" />}

        <span className="relative shrink-0">
          <Avatar name={name} src={conversation.contact?.avatarUrl} />
          {conversation.isAiActive && (
            <span
              title="AI auto-reply is active"
              className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white"
            />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span
              className={cn(
                "truncate text-sm text-slate-900",
                unread > 0 ? "font-semibold" : "font-medium",
              )}
            >
              {name}
            </span>
            <span className="ml-auto shrink-0 text-[11px] text-slate-400">
              {timeAgo(conversation.lastMessageAt)}
            </span>
          </span>

          <span className="mt-0.5 flex items-center gap-2">
            <span
              className={cn(
                "truncate text-xs",
                unread > 0 ? "font-medium text-slate-700" : "text-slate-500",
              )}
            >
              {preview}
            </span>
            {unread > 0 && (
              <span className="ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[11px] font-semibold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </span>

          {labels.length > 0 && (
            <span className="mt-1.5 flex flex-wrap gap-1">
              {labels.slice(0, 3).map((label) => (
                <span
                  key={label}
                  className="inline-flex max-w-32 items-center truncate rounded px-1.5 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200"
                >
                  {label}
                </span>
              ))}
              {labels.length > 3 && (
                <span className="text-[10px] font-medium text-slate-400">
                  +{labels.length - 3}
                </span>
              )}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
