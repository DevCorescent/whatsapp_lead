import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CampaignStatus } from "@prisma/client";

interface CampaignFilters {
  status?: CampaignStatus;
  page?: number;
  limit?: number;
}

interface CreateCampaignInput {
  name: string;
  templateId?: string;
  message?: string;
  contactIds?: string[];
  tagIds?: string[];
  all?: boolean;
}

export function useCampaigns(filters?: CampaignFilters) {
  return useQuery({
    queryKey: ["campaigns", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.status) params.set("status", filters.status);
      if (filters?.page) params.set("page", String(filters.page));
      if (filters?.limit) params.set("limit", String(filters.limit));
      const res = await fetch(`/api/campaigns?${params}`);
      if (!res.ok) throw new Error("Failed to fetch campaigns");
      return res.json();
    },
  });
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: ["campaigns", id],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${id}`);
      if (!res.ok) throw new Error("Failed to fetch campaign");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateCampaignInput) => {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to create campaign");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
}

export function useLaunchCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "RUNNING" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to launch campaign");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to delete campaign");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
}
