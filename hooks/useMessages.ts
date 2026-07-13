import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface ConversationFilters {
  status?: string;
  assigneeId?: string;
}

interface SendMessageInput {
  conversationId: string;
  content: string;
  type?: "TEXT";
  isNote?: boolean;
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

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: SendMessageInput) => {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, type: data.type ?? "TEXT" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to send message");
      }
      return res.json();
    },
    onSuccess: (_data, { conversationId }) => {
      queryClient.invalidateQueries({ queryKey: ["conversations", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
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

export function useResolveConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "RESOLVED" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to resolve conversation");
      }
      return res.json();
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["conversations", id] });
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
