// TODO [GAURANSH]: React Query hooks for CRM leads.
//
// useLeads(filters)    — GET /api/leads (grouped by stage for Kanban)
// useLead(id)          — GET /api/leads/[id]
// useCreateLead()      — POST /api/leads
// useUpdateLeadStage() — PATCH /api/leads/[id] { stage } (drag-drop Kanban)
// useQualifyLead()     — POST /api/ai/qualify { conversationId } (AI BANT scoring)
//
// Kanban note: On drag-drop, call useUpdateLeadStage optimistic update first,
// then revert on error (tanstack query optimistic updates pattern).

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useLeads(filters?: { stage?: string; assigneeId?: string; scoreLabel?: string }) {
  return useQuery({
    queryKey: ["leads", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.stage) params.set("stage", filters.stage);
      if (filters?.assigneeId) params.set("assigneeId", filters.assigneeId);
      if (filters?.scoreLabel) params.set("scoreLabel", filters.scoreLabel);
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

// TODO [GAURANSH]: useCreateLead, useUpdateLeadStage (with optimistic update), useQualifyLead
