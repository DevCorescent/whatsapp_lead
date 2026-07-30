import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

/**
 * A WhatsApp message template as the API returns it.
 *
 * `status` mirrors Meta's review state — PENDING, APPROVED, REJECTED — and is a plain string on the
 * model rather than an enum, so it is compared case-insensitively wherever it is read.
 */
export interface MessageTemplateDTO {
  id: string;
  name: string;
  category: string;
  language: string;
  headerType: string | null;
  headerContent: string | null;
  body: string;
  footer: string | null;
  variables: string[];
  waTemplateId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

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

/**
 * The active workspace's templates, optionally narrowed to one review status.
 *
 * The filter is applied by the API, not here: a workspace can hold far more templates than a picker
 * shows, and "approved only" is a question the database can answer in the same indexed read.
 *
 * The status is part of the query key, so the approved list and the full list are separate cache
 * entries rather than one overwriting the other.
 */
export function useTemplates(status?: string) {
  return useQuery<MessageTemplateDTO[]>({
    queryKey: ["templates", status ?? "all"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      const res = await fetch(`/api/templates?${params}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error((json as { error?: string }).error ?? "Failed to fetch templates");
      }
      return Array.isArray(json.data) ? (json.data as MessageTemplateDTO[]) : [];
    },
  });
}

/** Templates Meta has approved — the only ones a campaign may legally broadcast. */
export function useApprovedTemplates() {
  return useTemplates("APPROVED");
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
