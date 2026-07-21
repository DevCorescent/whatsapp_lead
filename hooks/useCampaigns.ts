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
  /** ISO datetime — saves the campaign as SCHEDULED. */
  scheduledAt?: string;
  /** With no schedule, send the campaign immediately. */
  sendNow?: boolean;
}

type CampaignAction =
  | { action: "schedule"; scheduledAt: string }
  | { action: "reschedule"; scheduledAt: string }
  | { action: "cancel" }
  | { action: "retry" }
  | { action: "send_now" };

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

/**
 * Perform a scheduling action on a campaign: schedule, reschedule, cancel, retry
 * or send_now. All routed through PATCH /api/campaigns/[id].
 */
export function useCampaignAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: CampaignAction & { id: string }) => {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Campaign action failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
}

/** Convenience wrapper: send a campaign immediately. */
export function useLaunchCampaign() {
  const action = useCampaignAction();
  return {
    ...action,
    mutate: (id: string) => action.mutate({ id, action: "send_now" }),
    mutateAsync: (id: string) => action.mutateAsync({ id, action: "send_now" }),
  };
}

/** List the tenant's upcoming scheduled campaigns (soonest first). */
export function useScheduledCampaigns() {
  return useQuery({
    queryKey: ["campaigns", "scheduled"],
    queryFn: async () => {
      const res = await fetch("/api/campaigns/scheduled");
      if (!res.ok) throw new Error("Failed to fetch scheduled campaigns");
      return res.json();
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
