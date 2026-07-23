import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { LeadScoreLabel } from "@prisma/client";
import type { ImportMode, ImportResult } from "@/lib/import";
import type { ImportLeadPayload } from "@/lib/leadsImport";

interface LeadFilters {
  stageId?: string;
  assigneeId?: string;
  scoreLabel?: LeadScoreLabel;
  search?: string;
  page?: number;
  limit?: number;
}

interface CreateLeadInput {
  contactId: string;
  title: string;
  stageId?: string;
  score?: number;
  value?: number;
  currency?: string;
  assignedToId?: string;
  notes?: string;
  budget?: string;
  authority?: string;
  requirement?: string;
  timeline?: string;
}

interface UpdateLeadInput {
  title?: string;
  stageId?: string;
  score?: number;
  value?: number;
  currency?: string;
  assignedToId?: string | null;
  notes?: string | null;
  lostReason?: string;
  budget?: string;
  authority?: string;
  requirement?: string;
  timeline?: string;
}

export function useLeads(filters?: LeadFilters) {
  return useQuery({
    queryKey: ["leads", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.stageId) params.set("stageId", filters.stageId);
      if (filters?.assigneeId) params.set("assigneeId", filters.assigneeId);
      if (filters?.scoreLabel) params.set("scoreLabel", filters.scoreLabel);
      if (filters?.search) params.set("search", filters.search);
      if (filters?.page) params.set("page", String(filters.page));
      if (filters?.limit) params.set("limit", String(filters.limit));
      const res = await fetch(`/api/leads?${params}`);
      if (!res.ok) throw new Error("Failed to fetch leads");
      return res.json();
    },
  });
}

export function useLead(id: string) {
  return useQuery({
    queryKey: ["leads", id],
    queryFn: async () => {
      const res = await fetch(`/api/leads/${id}`);
      if (!res.ok) throw new Error("Failed to fetch lead");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateLeadInput) => {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to create lead");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateLeadInput }) => {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to update lead");
      }
      return res.json();
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["leads", id] });
    },
  });
}

export function useUpdateLeadStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stageId }: { id: string; stageId: string }) => {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to update stage");
      }
      return res.json();
    },
    onMutate: async ({ id, stageId }) => {
      await queryClient.cancelQueries({ queryKey: ["leads"] });
      const previous = queryClient.getQueryData(["leads"]);
      queryClient.setQueryData(["leads"], (old: unknown) => {
        if (!old || typeof old !== "object") return old;
        const payload = old as { data?: unknown[] };
        if (!Array.isArray(payload.data)) return old;
        return {
          ...payload,
          data: payload.data.map((lead: unknown) => {
            const l = lead as { id: string; stageId: string };
            return l.id === id ? { ...l, stageId } : l;
          }),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["leads"], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/leads/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to delete lead");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

/**
 * Bulk-import leads through POST /api/leads/import — the lead counterpart to
 * `useImportContacts`. The same mutation powers the preview (`dryRun: true`, writes
 * nothing) and the real import; only a real run invalidates the leads cache so the
 * pipeline refreshes once, after the write.
 */
export function useImportLeads() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      leads: ImportLeadPayload[];
      mode: ImportMode;
      dryRun?: boolean;
    }): Promise<ImportResult> => {
      const res = await fetch("/api/leads/import", {
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
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      // Imported leads may create contacts too — keep that list fresh.
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useQualifyLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (leadId: string) => {
      const res = await fetch("/api/ai/qualify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "AI qualification failed");
      }
      return res.json();
    },
    onSuccess: (_data, leadId) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["leads", leadId] });
    },
  });
}
