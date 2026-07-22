"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

// Mirrors publicBusiness() in lib/business.ts — the encrypted access/verify tokens
// are never sent to the client, only boolean flags saying whether they are set.
export interface BusinessDTO {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  whatsappPhoneNumber: string | null;
  whatsappPhoneNumberId: string | null;
  whatsappBusinessId: string | null;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  logo: string | null;
  timezone: string;
  aiEnabled: boolean;
  autoReply: boolean;
  autoReplyDelay: number;
  aiModel: string | null;
  aiSystemPrompt: string | null;
  aiPersonality: string | null;
  aiResponseTone: string | null;
  aiTemperature: number;
  aiMaxTokens: number;
  offHoursMessage: string | null;
  hasWhatsappToken: boolean;
  hasWhatsappVerifyToken: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessesResponse {
  success: boolean;
  data: BusinessDTO[];
  currentBusinessId: string;
}

export interface BusinessInput {
  name: string;
  timezone?: string;
  logo?: string;
  status?: BusinessDTO["status"];
  whatsappPhoneNumber?: string;
  whatsappPhoneNumberId?: string;
  whatsappBusinessId?: string;
  whatsappAccessToken?: string;
  whatsappVerifyToken?: string;
  aiEnabled?: boolean;
  autoReply?: boolean;
  autoReplyDelay?: number;
  aiModel?: string;
  aiSystemPrompt?: string;
  aiPersonality?: string;
  aiResponseTone?: string;
  aiTemperature?: number;
  aiMaxTokens?: number;
  offHoursMessage?: string;
}

export function useBusinesses(initialData?: BusinessesResponse) {
  return useQuery<BusinessesResponse>({
    queryKey: ["businesses"],
    queryFn: async () => {
      const res = await fetch("/api/businesses");
      if (!res.ok) throw new Error("Failed to load businesses");
      return res.json();
    },
    initialData,
    staleTime: 30_000,
  });
}

export function useSwitchBusiness() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: async (businessId: string) => {
      const res = await fetch("/api/businesses/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to switch business");
      return json;
    },
    onSuccess: () => {
      // Switching business changes the ENTIRE CRM context. Dropping every cached
      // query forces the inbox, contacts, leads, campaigns, templates, knowledge
      // base and analytics to refetch under the newly selected business — no logout,
      // no manual reload. router.refresh() re-runs the server components (sidebar
      // badge, current-business label) against the new cookie.
      queryClient.invalidateQueries();
      router.refresh();
    },
  });
}

export function useCreateBusiness() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: BusinessInput) => {
      const res = await fetch("/api/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create business");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["businesses"] });
    },
  });
}

export function useUpdateBusiness() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: BusinessInput & { id: string }) => {
      const res = await fetch(`/api/businesses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to update business");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["businesses"] });
    },
  });
}

export function useDeleteBusiness() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/businesses/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to delete business");
      return json;
    },
    onSuccess: () => {
      // Deleting a business may have been the active one; refetch everything and
      // re-run the server so the resolver picks a remaining business.
      queryClient.invalidateQueries();
      router.refresh();
    },
  });
}
