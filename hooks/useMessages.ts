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

interface UpdateConversationInput {
  status?: "OPEN" | "ASSIGNED" | "RESOLVED" | "CLOSED";
  assignedToId?: string | null;
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
