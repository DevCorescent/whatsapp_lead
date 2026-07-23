import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { FlowNode, FlowEdge } from "@/lib/chatbot";

// The API returns nodes/edges as JSON; the editor casts them to FlowNode[]/FlowEdge[].
export interface ChatbotFlowDTO {
  id: string;
  name: string;
  description: string | null;
  keywords: string[];
  isActive: boolean;
  nodes: FlowNode[];
  edges: FlowEdge[];
  createdAt: string;
  updatedAt: string;
}

async function jsonOrThrow(res: Response, fallback: string) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    throw new Error((json as { error?: string }).error ?? fallback);
  }
  return json.data;
}

export function useFlows() {
  return useQuery<ChatbotFlowDTO[]>({
    queryKey: ["chatbot-flows"],
    queryFn: async () => {
      const res = await fetch("/api/chatbot/flows");
      return jsonOrThrow(res, "Failed to load flows") as Promise<ChatbotFlowDTO[]>;
    },
  });
}

export function useFlow(id: string | undefined) {
  return useQuery<ChatbotFlowDTO>({
    queryKey: ["chatbot-flow", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await fetch(`/api/chatbot/flows/${id}`);
      return jsonOrThrow(res, "Failed to load flow") as Promise<ChatbotFlowDTO>;
    },
  });
}

export function useCreateFlow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string; keywords?: string[] }) => {
      const res = await fetch("/api/chatbot/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return jsonOrThrow(res, "Failed to create flow") as Promise<ChatbotFlowDTO>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chatbot-flows"] }),
  });
}

export interface UpdateFlowPayload {
  name?: string;
  description?: string | null;
  keywords?: string[];
  nodes?: FlowNode[];
  edges?: FlowEdge[];
  isActive?: boolean;
}

export function useUpdateFlow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateFlowPayload }) => {
      const res = await fetch(`/api/chatbot/flows/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return jsonOrThrow(res, "Failed to update flow") as Promise<ChatbotFlowDTO>;
    },
    onSuccess: (flow) => {
      queryClient.invalidateQueries({ queryKey: ["chatbot-flows"] });
      queryClient.invalidateQueries({ queryKey: ["chatbot-flow", flow.id] });
    },
  });
}

export function useDeleteFlow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/chatbot/flows/${id}`, { method: "DELETE" });
      await jsonOrThrow(res, "Failed to delete flow");
      return id;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chatbot-flows"] }),
  });
}

export function useDuplicateFlow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/chatbot/flows/${id}/duplicate`, { method: "POST" });
      return jsonOrThrow(res, "Failed to duplicate flow") as Promise<ChatbotFlowDTO>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chatbot-flows"] }),
  });
}
