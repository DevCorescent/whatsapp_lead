// TODO [GAURANSH]: React Query hooks for inbox messages + real-time Pusher.
//
// useConversations(filters) — GET /api/conversations (list)
// useConversation(id)       — GET /api/conversations/[id] (with messages)
// useSendMessage()          — POST /api/messages (mutation)
// useResolveConversation()  — PATCH /api/conversations/[id] { status: "RESOLVED" }
//
// Real-time: Subscribe to Pusher channel "private-tenant-{tenantId}"
//   Events: "new-message", "conversation-updated"
//   On new-message → prepend to conversation message list (queryClient.setQueryData)
//   On conversation-updated → invalidate conversations list

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useConversations(filters?: { status?: string; assigneeId?: string }) {
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
  });
}

// TODO [GAURANSH]: useSendMessage, useResolveConversation + Pusher subscription
