import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface CreateTemplateInput {
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  language?: string;
  body: string;
  headerType?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  headerContent?: string;
  footer?: string;
  buttons?: Array<{ type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"; text: string; url?: string; phone?: string }>;
  variables?: string[];
}

export function useTemplates() {
  return useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const res = await fetch("/api/templates");
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    },
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateTemplateInput) => {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to create template");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
  });
}
