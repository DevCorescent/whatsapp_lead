import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface CreateDocInput {
  name: string;
  type: "TEXT" | "URL" | "PDF" | "DOCX";
  content?: string;
  url?: string;
}

export function useKnowledgeDocs() {
  return useQuery({
    queryKey: ["knowledge"],
    queryFn: async () => {
      const res = await fetch("/api/knowledge");
      if (!res.ok) throw new Error("Failed to fetch knowledge docs");
      return res.json();
    },
  });
}

export function useCreateKnowledgeDoc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateDocInput) => {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to create knowledge doc");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge"] });
    },
  });
}

export function useDeleteKnowledgeDoc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to delete document");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge"] });
    },
  });
}
