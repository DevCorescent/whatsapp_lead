import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateContactInput, UpdateContactInput } from "@/lib/validators/contact";
import type { ImportRequest, ImportResult } from "@/lib/contactsImport";

interface ContactFilters {
  search?: string;
  tagId?: string;
  source?: string;
  page?: number;
  limit?: number;
}

export function useContacts(filters?: ContactFilters) {
  return useQuery({
    queryKey: ["contacts", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.search) params.set("search", filters.search);
      if (filters?.tagId) params.set("tagId", filters.tagId);
      if (filters?.source) params.set("source", filters.source);
      if (filters?.page) params.set("page", String(filters.page));
      if (filters?.limit) params.set("limit", String(filters.limit));
      const res = await fetch(`/api/contacts?${params}`);
      if (!res.ok) throw new Error("Failed to fetch contacts");
      return res.json();
    },
  });
}

export function useContactSources() {
  return useQuery<string[]>({
    queryKey: ["contacts", "sources"],
    queryFn: async () => {
      const res = await fetch("/api/contacts/sources");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to fetch contact sources");
      return Array.isArray(json.data) ? json.data : [];
    },
  });
}

export function useContact(id: string) {
  return useQuery({
    queryKey: ["contacts", id],
    queryFn: async () => {
      const res = await fetch(`/api/contacts/${id}`);
      if (!res.ok) throw new Error("Failed to fetch contact");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateContactInput) => {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create contact");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["contacts", "sources"] });
    },
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: UpdateContactInput & { id: string }) => {
      const res = await fetch(`/api/contacts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to update contact");
      return json;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["contacts", id] });
    },
  });
}

/**
 * Bulk-import contacts through the existing POST /api/contacts/import endpoint.
 *
 * The same mutation powers both the preview (`dryRun: true`, which writes nothing) and
 * the real import — only a real run invalidates the contacts cache, so the list and the
 * source filter refresh once, after the write actually happens.
 */
export function useImportContacts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ImportRequest): Promise<ImportResult> => {
      const res = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Import failed");
      return json.data as ImportResult;
    },
    onSuccess: (_data, variables) => {
      if (variables.dryRun) return;
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["contacts", "sources"] });
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/contacts/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to delete contact");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}
