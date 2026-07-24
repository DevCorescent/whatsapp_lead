import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface QuickReply {
  id: string;
  shortcode: string;
  content: string;
  createdAt: string;
}

interface QuickReplyInput {
  shortcode: string;
  content: string;
}

export function useQuickReplies() {
  return useQuery({
    queryKey: ["quick-replies"],
    queryFn: async () => {
      const res = await fetch("/api/quick-replies");
      if (!res.ok) throw new Error("Failed to fetch quick replies");
      return res.json();
    },
  });
}

async function unwrapError(res: Response, fallback: string) {
  const err = await res.json().catch(() => ({}));
  return new Error((err as { error?: string }).error ?? fallback);
}

export function useCreateQuickReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: QuickReplyInput) => {
      const res = await fetch("/api/quick-replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw await unwrapError(res, "Failed to create quick reply");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quick-replies"] });
    },
  });
}

export function useUpdateQuickReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<QuickReplyInput> & { id: string }) => {
      const res = await fetch(`/api/quick-replies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw await unwrapError(res, "Failed to update quick reply");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quick-replies"] });
    },
  });
}

export function useDeleteQuickReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/quick-replies/${id}`, { method: "DELETE" });
      if (!res.ok) throw await unwrapError(res, "Failed to delete quick reply");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quick-replies"] });
    },
  });
}
