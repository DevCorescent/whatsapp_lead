import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export type TemplateButton = {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
  text: string;
  url?: string;
  phone?: string;
};

export interface TemplateInput {
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  language?: string;
  body: string;
  headerType?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | null;
  headerContent?: string | null;
  footer?: string | null;
  buttons?: TemplateButton[] | null;
  variables?: string[];
}

export interface TemplateDTO {
  id: string;
  name: string;
  category: string;
  language: string;
  headerType: string | null;
  headerContent: string | null;
  body: string;
  footer: string | null;
  buttons: TemplateButton[] | null;
  variables: string[];
  waTemplateId: string | null;
  status: string;
  rejectionReason: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

async function jsonOrThrow(res: Response, fallback: string) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error((json as { error?: string }).error ?? fallback);
  return json.data;
}

/** List templates, optionally filtered by status (e.g. "APPROVED"). */
export function useTemplates(status?: string) {
  return useQuery<TemplateDTO[]>({
    queryKey: ["templates", status ?? "all"],
    queryFn: async () => {
      const qs = status ? `?status=${status}` : "";
      const res = await fetch(`/api/templates${qs}`);
      return jsonOrThrow(res, "Failed to fetch templates") as Promise<TemplateDTO[]>;
    },
  });
}

export function useTemplate(id: string | undefined) {
  return useQuery<TemplateDTO>({
    queryKey: ["template", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await fetch(`/api/templates/${id}`);
      return jsonOrThrow(res, "Failed to fetch template") as Promise<TemplateDTO>;
    },
  });
}

function useTemplateInvalidation() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["templates"] });
}

export function useCreateTemplate() {
  const invalidate = useTemplateInvalidation();
  return useMutation({
    mutationFn: async (data: TemplateInput) => {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return jsonOrThrow(res, "Failed to create template") as Promise<TemplateDTO>;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateTemplate() {
  const invalidate = useTemplateInvalidation();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TemplateInput> }) => {
      const res = await fetch(`/api/templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return jsonOrThrow(res, "Failed to update template") as Promise<TemplateDTO>;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteTemplate() {
  const invalidate = useTemplateInvalidation();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
      await jsonOrThrow(res, "Failed to delete template");
      return id;
    },
    onSuccess: invalidate,
  });
}

export function useDuplicateTemplate() {
  const invalidate = useTemplateInvalidation();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/templates/${id}/duplicate`, { method: "POST" });
      return jsonOrThrow(res, "Failed to duplicate template") as Promise<TemplateDTO>;
    },
    onSuccess: invalidate,
  });
}

export function useSubmitTemplate() {
  const invalidate = useTemplateInvalidation();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/templates/${id}/submit`, { method: "POST" });
      return jsonOrThrow(res, "Failed to submit template") as Promise<TemplateDTO>;
    },
    onSuccess: invalidate,
  });
}

export function useRefreshTemplate() {
  const invalidate = useTemplateInvalidation();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/templates/${id}/refresh`, { method: "POST" });
      return jsonOrThrow(res, "Failed to refresh template") as Promise<TemplateDTO>;
    },
    onSuccess: invalidate,
  });
}

export function useSyncTemplates() {
  const invalidate = useTemplateInvalidation();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/templates/sync", { method: "POST" });
      return jsonOrThrow(res, "Failed to sync templates");
    },
    onSuccess: invalidate,
  });
}
