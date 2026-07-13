import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { LeadStage, LeadScoreLabel } from "@prisma/client";

interface LeadFilters {
  stage?: LeadStage;
  assigneeId?: string;
  scoreLabel?: LeadScoreLabel;
  search?: string;
  page?: number;
  limit?: number;
}

interface CreateLeadInput {
  contactId: string;
  title: string;
  stage?: LeadStage;
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
  stage?: LeadStage;
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
      if (filters?.stage) params.set("stage", filters.stage);
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
    mutationFn: async ({ id, stage }: { id: string; stage: LeadStage }) => {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to update stage");
      }
      return res.json();
    },
    onMutate: async ({ id, stage }) => {
      await queryClient.cancelQueries({ queryKey: ["leads"] });
      const previous = queryClient.getQueryData(["leads"]);
      queryClient.setQueryData(["leads"], (old: unknown) => {
        if (!old || typeof old !== "object") return old;
        const payload = old as { data?: unknown[] };
        if (!Array.isArray(payload.data)) return old;
        return {
          ...payload,
          data: payload.data.map((lead: unknown) => {
            const l = lead as { id: string; stage: string };
            return l.id === id ? { ...l, stage } : l;
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
