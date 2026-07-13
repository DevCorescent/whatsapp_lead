"use client";

import { useCallback, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useConversation, useConversations } from "@/hooks/useMessages";
import { ChatWindow } from "@/components/inbox/ChatWindow";
import { ContactPanel } from "@/components/inbox/ContactPanel";
import {
  ConversationList,
  type InboxAgent,
  type InboxConversation,
  type InboxMessage,
  type InboxTab,
} from "@/components/inbox/ConversationList";
import { cn } from "@/lib/utils";

/**
 * Every /api route is still a 501 stub, so the React Query hooks are expected to
 * reject. Nothing here trusts the payload shape: responses are unwrapped
 * defensively and each column falls back to a loading or empty view.
 */

/** Stable identity so ChatWindow's timeline memo doesn't recompute every render. */
const EMPTY: InboxMessage[] = [];

const STATUS_BY_TAB: Partial<Record<InboxTab, string>> = {
  open: "OPEN",
  assigned: "ASSIGNED",
  resolved: "RESOLVED",
};

export default function InboxPage() {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const userName = session?.user?.name;
  const userAvatar = session?.user?.avatar;

  const [tab, setTab] = useState<InboxTab>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Optimistically "sent" messages, per conversation, until POST /api/messages exists. */
  const [outbox, setOutbox] = useState<Record<string, InboxMessage[]>>({});

  const handleSend = useCallback((conversationId: string, message: InboxMessage) => {
    setOutbox((prev) => ({
      ...prev,
      [conversationId]: [...(prev[conversationId] ?? []), message],
    }));
  }, []);

  const filters = useMemo(() => {
    const status = STATUS_BY_TAB[tab];
    if (status) return { status };
    if (tab === "mine" && userId) return { assigneeId: userId };
    return undefined;
  }, [tab, userId]);

  const { data: listData, isLoading: listLoading, isError: listError } = useConversations(filters);
  const {
    data: detailData,
    isLoading: detailLoading,
    isError: detailError,
  } = useConversation(selectedId ?? "");

  const all = useMemo(() => toArray<InboxConversation>(listData), [listData]);

  // The API may or may not honour the filter params yet, so narrow again here —
  // and search is client-side by design.
  const conversations = useMemo(() => {
    const status = STATUS_BY_TAB[tab];
    const query = search.trim().toLowerCase();

    return all
      .filter((c) => {
        if (status && c.status !== status) return false;
        if (tab === "mine" && userId) {
          const assignee = c.assignedTo?.id ?? c.assignedToId ?? null;
          if (assignee !== userId) return false;
        }
        if (!query) return true;
        return [c.contact?.name, c.contact?.phone, c.contact?.company, c.lastMessagePreview]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(query));
      })
      .sort((a, b) => time(b.lastMessageAt) - time(a.lastMessageAt));
  }, [all, tab, search, userId]);

  /** Prefer the detail payload; fall back to the list row so the header still renders. */
  const selected = useMemo<InboxConversation | null>(() => {
    if (!selectedId) return null;
    const detail = unwrap<InboxConversation>(detailData);
    const row = all.find((c) => c.id === selectedId) ?? null;
    if (detail?.id) return { ...row, ...detail };
    return row;
  }, [selectedId, detailData, all]);

  const messages = useMemo<InboxMessage[]>(() => {
    const detail = unwrap<InboxConversation>(detailData);
    return toArray<InboxMessage>(detail?.messages ?? unwrap<unknown>(detailData));
  }, [detailData]);

  /** No team endpoint exists yet — build the assignee options from what we have. */
  const agents = useMemo<InboxAgent[]>(() => {
    const byId = new Map<string, InboxAgent>();
    if (userId) {
      byId.set(userId, {
        id: userId,
        name: userName ? `${userName} (me)` : "Me",
        avatar: userAvatar,
      });
    }
    for (const c of all) {
      const agent = c.assignedTo;
      if (agent?.id && !byId.has(agent.id)) byId.set(agent.id, agent);
    }
    return [...byId.values()];
  }, [all, userId, userName, userAvatar]);

  return (
    // The dashboard <main> adds p-4/lg:p-6 and the topbar is h-16 — cancel both so
    // the inbox owns the full viewport and each column scrolls independently.
    <div className="-m-4 flex h-[calc(100vh-4rem)] overflow-hidden bg-white lg:-m-6">
      <ConversationList
        conversations={conversations}
        selectedId={selectedId}
        onSelect={setSelectedId}
        isLoading={listLoading}
        isError={listError}
        search={search}
        onSearchChange={setSearch}
        tab={tab}
        onTabChange={setTab}
        className={cn("w-full shrink-0 md:w-80", selectedId && "hidden md:flex")}
      />

      {/* Keyed so composer/tab state resets cleanly when a different thread opens. */}
      <ChatWindow
        key={selectedId ?? "empty"}
        conversation={selected}
        messages={messages}
        localMessages={selectedId ? (outbox[selectedId] ?? EMPTY) : EMPTY}
        onSend={handleSend}
        isLoading={Boolean(selectedId) && detailLoading}
        isError={detailError}
        onBack={() => setSelectedId(null)}
        className={cn("min-w-0 flex-1", selectedId ? "flex" : "hidden md:flex")}
      />

      <ContactPanel
        key={`panel-${selectedId ?? "empty"}`}
        conversation={selected}
        agents={agents}
        isLoading={Boolean(selectedId) && detailLoading}
        className="hidden w-72 shrink-0 xl:flex"
      />
    </div>
  );
}

// ─── Defensive payload access ─────────────────────────────────────────────────

/** Accepts `T`, `{ data: T }` or `{ success, data: T }` — anything else is null. */
function unwrap<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as { data?: unknown }).data;
  if (data && typeof data === "object") return data as T;
  return payload as T;
}

/** Accepts `T[]`, `{ data: T[] }` or `{ data: { items: T[] } }` — anything else is []. */
function toArray<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (!payload || typeof payload !== "object") return [];

  const data = (payload as { data?: unknown }).data;
  if (Array.isArray(data)) return data as T[];

  if (data && typeof data === "object") {
    const items = (data as { items?: unknown }).items;
    if (Array.isArray(items)) return items as T[];
  }
  return [];
}

function time(date?: string | Date | null) {
  if (!date) return 0;
  const t = new Date(date).getTime();
  return Number.isNaN(t) ? 0 : t;
}
