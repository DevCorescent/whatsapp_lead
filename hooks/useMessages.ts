// ============================================================================
// OWNER  : Gauransh
// MODULE : React Query Hooks — Inbox
//
// HOOKS
// useConversations(filters)  - GET   /api/conversations
// useConversation(id)        - GET   /api/conversations/[id]
// useSendMessage()           - POST  /api/messages
// useUpdateConversation()    - PATCH /api/conversations/[id]
// useResolveConversation()   - PATCH /api/conversations/[id] { status: "RESOLVED" }
// useAiReply()               - POST  /api/ai/reply
// useAiSummarize()           - POST  /api/ai/summarize
// ============================================================================
//
// The two query hooks below key on ["conversations", …]. The mutations invalidate that whole prefix
// rather than picking individual keys, and that is the point of the shape: a conversation's messages
// are not a cache entry of their own — the detail endpoint returns them nested inside the
// conversation — so invalidating the prefix refreshes the inbox list and the open thread together.
// Any narrower invalidation would refresh the thread and leave the list showing a stale preview, or
// the reverse.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Message } from "@prisma/client";

/** The envelope every route in this project returns. Discriminated, so a failure cannot be read. */
type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/** Body accepted by POST /api/messages. Mirrors the route's `sendMessageSchema`. */
export interface SendMessageInput {
  conversationId: string;
  content: string;
  type?: "TEXT";
  isNote?: boolean;
}

/**
 * Read a route's response, surfacing the server's own error message when it fails.
 *
 * Exists so that no hook in this file swallows a failure. The API answers a rejected request with a
 * 4xx and a human-readable reason — "Conversation not found", "WhatsApp is not connected" — and a
 * generic "request failed" thrown from the client would discard the one piece of information the
 * toast is there to display. The rejection carries the server's words, not ours.
 *
 * `success: false` is treated as a failure even on a 2xx: the envelope is the contract, and a hook
 * that returned `{ success: false }` as data would hand the component an error dressed as a result.
 */
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  const payload = (await res.json()) as ApiResponse<T>;

  if (!res.ok || !payload.success) {
    throw new Error(payload.success ? "Request failed" : payload.error);
  }

  return payload.data;
}

interface ConversationFilters {
  status?: string;
  assigneeId?: string;
}

/**
 * PATCH /api/conversations/[id] validates with a `strictObject` naming the field `assigneeId` — the
 * API name and the `assignedToId` column it writes deliberately differ. This interface said
 * `assignedToId`, which that validator rejects outright, so any assignment made through this hook
 * would have failed; it names what the route actually accepts.
 */
interface UpdateConversationInput {
  status?: "OPEN" | "ASSIGNED" | "RESOLVED" | "CLOSED";
  assigneeId?: string | null;
  /** Per-conversation AI auto-reply switch, stored on the conversation itself. */
  isAiActive?: boolean;
}

export function useConversations(filters?: ConversationFilters) {
  return useQuery({
    queryKey: ["conversations", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.status) params.set("status", filters.status);
      if (filters?.assigneeId) params.set("assigneeId", filters.assigneeId);
      const res = await fetch(`/api/conversations?${params}`);
      if (!res.ok) throw new Error("Failed to fetch conversations");
      return res.json();
    },
    refetchInterval: 30000, // poll every 30s as fallback when Pusher not wired
  });
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: ["conversations", id],
    queryFn: async () => {
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) throw new Error("Failed to fetch conversation");
      return res.json();
    },
    enabled: !!id,
    refetchInterval: 15000, // poll for new messages
  });
}

/**
 * Send a message, or record an internal note.
 *
 * No optimistic update, deliberately. An outbound message is not a local state change the client can
 * predict: the server calls Meta *before* it persists, and the WhatsApp API can reject the send for
 * reasons only it knows — an opted-out recipient, an expired 24-hour session window, a throttled
 * number. Painting the message into the thread before the server confirms would show an agent a
 * message the customer never received, and rolling it back afterwards would make it flicker out of a
 * conversation they have already started reading. The one place a mutation must not lie is the one
 * where the user believes something has left the building.
 *
 * Invalidating the `["conversations"]` prefix refreshes both the open thread — which now holds the
 * new message — and the inbox list, whose `lastMessagePreview` and `lastMessageAt` the server has
 * just moved. The two are written in one transaction on the server; refreshing them separately is
 * how they would come apart on the client.
 */
export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation<Message, Error, SendMessageInput>({
    mutationFn: (input) =>
      request<Message>("/api/messages", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useUpdateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateConversationInput }) => {
      const res = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to update conversation");
      }
      return res.json();
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["conversations", id] });
    },
  });
}

/**
 * Patch `isAiActive` onto whichever cached conversation payloads carry this thread.
 *
 * Two shapes hold conversations and both must move together: the inbox list caches an array under
 * `["conversations", filters]`, and the open thread caches a single object under
 * `["conversations", id]`. Updating one and not the other is how a toggle ends up on in the header
 * and off in the list — the same row disagreeing with itself in two panels.
 *
 * Written defensively rather than cast, because these caches also hold rejected and in-flight
 * states, and a blind `payload.data.map` would throw on the first one it met.
 */
function patchCachedAiActive(payload: unknown, id: string, isAiActive: boolean): unknown {
  if (!payload || typeof payload !== "object") return payload;

  const envelope = payload as { data?: unknown };
  const inner = envelope.data;

  if (Array.isArray(inner)) {
    return {
      ...envelope,
      data: inner.map((row) =>
        row && typeof row === "object" && (row as { id?: string }).id === id
          ? { ...row, isAiActive }
          : row
      ),
    };
  }

  if (inner && typeof inner === "object" && (inner as { id?: string }).id === id) {
    return { ...envelope, data: { ...inner, isAiActive } };
  }

  return payload;
}

/**
 * Turn a conversation's AI auto-reply on or off, and keep the cache as the only source of truth.
 *
 * `isAiActive` is a column on Conversation and the flag the inbound worker reads before it drafts a
 * reply, so this is a real state change, not a display preference. The component that renders the
 * switch holds no copy of it — it reads the cached conversation — which is what makes the setting
 * survive a remount, a route change and a refresh: there is no local state to lose.
 *
 * The cache is patched in `onMutate` so the switch responds immediately, and the pre-mutation
 * snapshot is restored if the write fails. Leaving it flipped on a failure would be the worse lie:
 * it would tell an agent the bot is off for a conversation it is still answering.
 *
 * `cancelQueries` matters more here than it usually does. Both conversation queries poll — every 30s
 * for the list, 15s for the thread — so a refetch issued before the toggle can land would otherwise
 * resolve afterwards and overwrite the optimistic value with the pre-toggle one, making the switch
 * appear to flip itself back a few seconds later.
 */
export function useSetConversationAiActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isAiActive }: { id: string; isAiActive: boolean }) =>
      request<{ id: string; isAiActive: boolean }>(`/api/conversations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isAiActive }),
      }),

    onMutate: async ({ id, isAiActive }) => {
      await queryClient.cancelQueries({ queryKey: ["conversations"] });

      const snapshot = queryClient.getQueriesData({ queryKey: ["conversations"] });

      queryClient.setQueriesData({ queryKey: ["conversations"] }, (old: unknown) =>
        patchCachedAiActive(old, id, isAiActive)
      );

      return { snapshot };
    },

    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.snapshot ?? []) {
        queryClient.setQueryData(key, data);
      }
    },

    // Reconcile with the server either way: on success to confirm, on failure to discard whatever
    // the rollback could not restore.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

/**
 * Mark a conversation resolved.
 *
 * There is no `/api/conversations/[id]/resolve` route in this project — resolution is a status
 * transition on the conversation itself, so this PATCHes the conversation with `status: "RESOLVED"`,
 * which is the contract the route actually exposes. Inventing a sub-route on the client would just
 * produce a 404 at runtime.
 *
 * No optimistic update, as specified — and it is the right call for a second reason: resolving is a
 * deliberate, low-frequency action with a visible result. The latency is not worth a rollback path,
 * and a conversation that flickered out of the open list and back in on failure would be more
 * alarming than one that took 200ms to move.
 *
 * The prefix invalidation covers the list (the thread must leave the OPEN filter) and the detail
 * (its status badge must change). Both read the same conversation; refreshing one without the other
 * is how a thread ends up resolved in one panel and open in another.
 */
export function useResolveConversation() {
  const queryClient = useQueryClient();

  return useMutation<{ id: string }, Error, string>({
    mutationFn: (conversationId) =>
      request<{ id: string }>(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "RESOLVED" }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useAiReply() {
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const res = await fetch("/api/ai/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "AI reply failed");
      }
      return res.json();
    },
  });
}

/**
 * Score the conversation's lead with AI.
 *
 * `/api/ai/qualify` writes the score and BANT fields onto the lead, so unlike summarise this is not
 * read-only — the leads and conversations caches both go stale on success and are invalidated.
 */
export function useAiQualify() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const res = await fetch("/api/ai/qualify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Qualification failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

/** Classify how the customer currently feels. Read-only, like summarise — nothing to invalidate. */
export function useAiSentiment() {
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const res = await fetch("/api/ai/sentiment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Sentiment analysis failed");
      }
      return res.json();
    },
  });
}

export function useAiSummarize() {
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Summarization failed");
      }
      return res.json();
    },
  });
}
