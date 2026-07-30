"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import PusherClient from "pusher-js";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useConversation, useConversations } from "@/hooks/useMessages";
import { ChatWindow } from "@/components/inbox/ChatWindow";
import { ContactPanel } from "@/components/inbox/ContactPanel";
import { NewConversationModal } from "@/components/inbox/NewConversationModal";
import {
  ConversationList,
  type InboxAgent,
  type InboxConversation,
  type InboxMessage,
  type InboxTab,
} from "@/components/inbox/ConversationList";
import { Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * The inbox reads two endpoints — the conversation list and one thread — and unwraps both
 * defensively: the same payload feeds three columns, and a half-populated row must still render
 * rather than take the page down with it.
 */

/** Stable identity so ChatWindow's timeline memo doesn't recompute every render. */
const EMPTY: InboxMessage[] = [];

const STATUS_BY_TAB: Partial<Record<InboxTab, string>> = {
  open: "OPEN",
  assigned: "ASSIGNED",
  resolved: "RESOLVED",
};

/**
 * `useSearchParams` suspends when the route is prerendered, so the view that reads it lives below a
 * boundary of its own. Without this the production build fails outright — see Next's
 * "Missing Suspense boundary with useSearchParams".
 */
export default function InboxPage() {
  return (
    <Suspense fallback={<InboxFallback />}>
      <InboxView />
    </Suspense>
  );
}

function InboxView() {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const userName = session?.user?.name;
  const userAvatar = session?.user?.avatar;
  const tenantId = session?.user?.tenantId;

  const queryClient = useQueryClient();

  // Pusher real-time subscription: invalidate conversations when a new message arrives.
  // Falls back to the 30s poll in useConversations when Pusher is not configured.
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!key || !cluster || !tenantId) return;

    const client = new PusherClient(key, { cluster });
    const channel = client.subscribe(`tenant-${tenantId}`);

    channel.bind("new-message", () => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    });

    return () => {
      channel.unbind_all();
      client.unsubscribe(`tenant-${tenantId}`);
      client.disconnect();
    };
  }, [tenantId, queryClient]);

  const [tab, setTab] = useState<InboxTab>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  /**
   * Attachments that have been uploaded but that POST /api/messages cannot carry yet — it accepts
   * TEXT only. They are held per conversation so switching threads does not lose them. Text
   * messages are *not* here: those go to the server and come back through the refetch.
   */
  const [outbox, setOutbox] = useState<Record<string, InboxMessage[]>>({});

  // Deep link: /inbox?conversation=<id>, which is where "Message" on a contact lands.
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("conversation");
  // Applied once per distinct id. Re-applying it on every render would fight the agent the moment
  // they clicked a different thread, snapping the selection back to whatever the URL still said.
  const appliedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!requestedId || appliedIdRef.current === requestedId) return;
    appliedIdRef.current = requestedId;
    setSelectedId(requestedId);
  }, [requestedId]);

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
      .sort((a, b) => activityTime(b) - activityTime(a));
  }, [all, tab, search, userId]);

  /** Prefer the detail payload; fall back to the list row so the header still renders. */
  const selected = useMemo<InboxConversation | null>(() => {
    if (!selectedId) return null;
    const detail = unwrap<InboxConversation>(detailData);
    const row = all.find((c) => c.id === selectedId) ?? null;
    if (detail?.id) return { ...row, ...detail };
    return row;
  }, [selectedId, detailData, all]);

  /**
   * Give up on a selection that resolves to nothing.
   *
   * A `?conversation=` id can be stale, deleted, or belong to a workspace the user has since
   * switched away from. With a selection but no conversation to show, the middle column renders its
   * "select a conversation" state *and* — on a narrow screen, where the columns are exclusive — the
   * list is hidden behind it with no way back. Clearing the selection returns the list. Done during
   * render rather than in an effect so no dead frame is painted, and it cannot loop: once
   * `selectedId` is null the condition is false.
   */
  if (selectedId && detailError && !selected) {
    setSelectedId(null);
  }

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
        onNewConversation={() => setNewConversationOpen(true)}
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

      <NewConversationModal
        open={newConversationOpen}
        onClose={() => setNewConversationOpen(false)}
        onStarted={(conversationId) => {
          // The thread may be brand new, so remember it as "already applied" — otherwise a stale
          // ?conversation= still in the URL would pull the selection back on the next render.
          appliedIdRef.current = conversationId;
          setSelectedId(conversationId);
        }}
      />
    </div>
  );
}

// ─── Loading shell ────────────────────────────────────────────────────────────

/** Shown while the Suspense boundary resolves — the same three-column frame, unpopulated. */
function InboxFallback() {
  return (
    <div className="-m-4 flex h-[calc(100vh-4rem)] overflow-hidden bg-white lg:-m-6">
      <div className="hidden w-80 shrink-0 flex-col gap-3 border-r border-slate-200 p-3 md:flex">
        <Skeleton className="h-9 w-full" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-2/5" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex-1 bg-slate-50" />
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

/**
 * When a thread last changed, for ordering the list.
 *
 * `lastMessageAt` alone is not enough: a conversation that has just been created — from a contact's
 * "Message" action, or the picker above — has no messages yet, so that column is null and the row
 * sorted to epoch zero, landing at the very bottom of the inbox. The thread the agent just opened
 * would be the hardest one in the list to find. Falling through to `updatedAt`/`createdAt` puts it
 * where its activity says it belongs, and leaves threads that do have messages ordered exactly as
 * before.
 */
function activityTime(conversation: InboxConversation) {
  return (
    time(conversation.lastMessageAt) ||
    time(conversation.updatedAt) ||
    time(conversation.createdAt)
  );
}

function time(date?: string | Date | null) {
  if (!date) return 0;
  const t = new Date(date).getTime();
  return Number.isNaN(t) ? 0 : t;
}
