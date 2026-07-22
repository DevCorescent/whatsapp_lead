import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChatbotFlow } from "@prisma/client";
import type { EngineStepResult, FlowVariables } from "@/lib/chatbot/engine";
import type { ValidationResult } from "@/lib/chatbot/validation";

// ─────────────────────────────────────────────────────────────────────────────
// Chatbot flow hooks — reuse the existing ChatbotFlow REST endpoints. Follows the
// same React Query conventions as the other hooks in this project.
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateFlowInput {
  name: string;
  description?: string;
  trigger?: string;
  keywords?: string[];
  nodes?: unknown[];
  edges?: unknown[];
  isActive?: boolean;
}

export interface UpdateFlowInput {
  name?: string;
  description?: string;
  trigger?: string;
  keywords?: string[];
  nodes?: unknown[];
  edges?: unknown[];
  isActive?: boolean;
}

async function unwrap<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? fallback);
  }
  const json = await res.json();
  return (json.data ?? json) as T;
}

export function useFlows() {
  return useQuery<ChatbotFlow[]>({
    queryKey: ["chatbot-flows"],
    queryFn: async () => {
      const res = await fetch("/api/chatbot/flows");
      if (!res.ok) throw new Error(`Failed to load flows (${res.status})`);
      const json = await res.json();
      if (json?.offline) throw new Error("Database unavailable");
      return Array.isArray(json) ? json : (json.data ?? []);
    },
    retry: false,
  });
}

export function useFlow(id: string | null) {
  return useQuery<ChatbotFlow>({
    queryKey: ["chatbot-flows", id],
    queryFn: async () => {
      const res = await fetch(`/api/chatbot/flows/${id}`);
      return unwrap<ChatbotFlow>(res, "Failed to load flow");
    },
    enabled: !!id,
    retry: false,
  });
}

export function useCreateFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateFlowInput) => {
      const res = await fetch("/api/chatbot/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trigger: "KEYWORD",
          keywords: [],
          nodes: [],
          edges: [],
          isActive: false,
          ...input,
        }),
      });
      return unwrap<ChatbotFlow>(res, "Failed to create flow");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatbot-flows"] }),
  });
}

export function useUpdateFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateFlowInput }) => {
      const res = await fetch(`/api/chatbot/flows/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return unwrap<ChatbotFlow>(res, "Failed to update flow");
    },
    // Keep the list in sync (node counts, active state, name) without clobbering the
    // editor's local canvas — the builder owns nodes/edges while open.
    onSuccess: (flow) => {
      qc.invalidateQueries({ queryKey: ["chatbot-flows"], refetchType: "none" });
      qc.setQueryData(["chatbot-flows", flow.id], flow);
    },
  });
}

export function useAutosaveFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, nodes, edges }: { id: string; nodes?: unknown[]; edges?: unknown[] }) => {
      const res = await fetch(`/api/chatbot/flows/${id}/autosave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes, edges }),
      });
      return unwrap<ChatbotFlow>(res, "Failed to autosave flow");
    },
    onSuccess: (flow) => {
      qc.invalidateQueries({ queryKey: ["chatbot-flows"], refetchType: "none" });
      qc.setQueryData(["chatbot-flows", flow.id], flow);
    },
  });
}

export function usePublishFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/chatbot/flows/${id}/publish`, { method: "POST" });
      return unwrap<ChatbotFlow>(res, "Failed to publish flow");
    },
    onSuccess: (flow) => {
      qc.invalidateQueries({ queryKey: ["chatbot-flows"], refetchType: "none" });
      qc.setQueryData(["chatbot-flows", flow.id], flow);
    },
  });
}

export function useDraftFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/chatbot/flows/${id}/draft`, { method: "POST" });
      return unwrap<ChatbotFlow>(res, "Failed to move flow to draft");
    },
    onSuccess: (flow) => {
      qc.invalidateQueries({ queryKey: ["chatbot-flows"], refetchType: "none" });
      qc.setQueryData(["chatbot-flows", flow.id], flow);
    },
  });
}

export function useDeleteFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/chatbot/flows/${id}`, { method: "DELETE" });
      return unwrap<{ success: true }>(res, "Failed to delete flow");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatbot-flows"] }),
  });
}

export function useDuplicateFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/chatbot/flows/${id}/duplicate`, { method: "POST" });
      return unwrap<ChatbotFlow>(res, "Failed to duplicate flow");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatbot-flows"] }),
  });
}

export function useValidateFlow() {
  return useMutation({
    mutationFn: async ({ id, nodes, edges }: { id: string; nodes: unknown[]; edges: unknown[] }) => {
      const res = await fetch(`/api/chatbot/flows/${id}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes, edges }),
      });
      return unwrap<ValidationResult>(res, "Failed to validate flow");
    },
  });
}

export function usePreviewFlow() {
  return useMutation({
    mutationFn: async ({
      id,
      nodes,
      edges,
      fromNodeId,
      input,
      variables,
    }: {
      id: string;
      nodes?: unknown[];
      edges?: unknown[];
      fromNodeId?: string;
      input?: string;
      variables?: FlowVariables;
    }) => {
      const res = await fetch(`/api/chatbot/flows/${id}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes, edges, fromNodeId, input, variables }),
      });
      return unwrap<EngineStepResult>(res, "Failed to preview flow");
    },
  });
}
