import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { TicketStatus, TicketPriority } from "@prisma/client";

interface TicketFilters {
  status?: TicketStatus;
  priority?: TicketPriority;
  assigneeId?: string;
  page?: number;
  limit?: number;
}

interface CreateTicketInput {
  subject: string;
  priority?: TicketPriority;
  department?: string;
  conversationId?: string;
}

interface UpdateTicketInput {
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedToId?: string | null;
  subject?: string;
  department?: string | null;
}

export function useTickets(filters?: TicketFilters) {
  return useQuery({
    queryKey: ["tickets", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.status) params.set("status", filters.status);
      if (filters?.priority) params.set("priority", filters.priority);
      if (filters?.assigneeId) params.set("assigneeId", filters.assigneeId);
      if (filters?.page) params.set("page", String(filters.page));
      if (filters?.limit) params.set("limit", String(filters.limit));
      const res = await fetch(`/api/tickets?${params}`);
      if (!res.ok) throw new Error("Failed to fetch tickets");
      return res.json();
    },
  });
}

export function useTicket(id: string) {
  return useQuery({
    queryKey: ["tickets", id],
    queryFn: async () => {
      const res = await fetch(`/api/tickets/${id}`);
      if (!res.ok) throw new Error("Failed to fetch ticket");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateTicketInput) => {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to create ticket");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}

export function useUpdateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateTicketInput }) => {
      const res = await fetch(`/api/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to update ticket");
      }
      return res.json();
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["tickets", id] });
    },
  });
}

export function useDeleteTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/tickets/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to delete ticket");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}
