import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Mirrors the sections returned by GET /api/settings. Secrets are never present —
// only `hasApiKey`/`hasAppSecret` flags — so the client can show "set" without
// ever holding the value.
export interface SettingsData {
  general: {
    workspaceName: string;
    slug: string;
    domain: string;
    language: string;
    timezone: string;
  };
  whatsapp: {
    phoneNumberId: string;
    businessAccountId: string;
    appId: string;
    verifyToken: string;
    hasApiKey: boolean;
    hasAppSecret: boolean;
    webhookUrl: string;
    connected: boolean;
  };
  ai: {
    aiEnabled: boolean;
    model: string;
    temperature: number;
    maxTokens: number;
    autoReply: boolean;
    replyDelay: number;
    offHoursOnly: boolean;
    responseTone: string;
    systemPrompt: string;
    timezone: string;
    startTime: string;
    endTime: string;
    businessDays: number[];
    offHoursMessage: string;
  };
  notifications: Record<string, { email: boolean; inApp: boolean }>;
}

export type SettingsSection = "general" | "whatsapp" | "ai" | "notifications";

export function useSettings() {
  return useQuery<SettingsData>({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to load settings");
      const json = await res.json();
      return json.data as SettingsData;
    },
    staleTime: 60_000,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ section, data }: { section: SettingsSection; data: unknown }) => {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, data }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to save settings");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

export interface WhatsAppTestResult {
  verifiedName: string | null;
  displayPhoneNumber: string | null;
  qualityRating: string | null;
}

export function useTestWhatsApp() {
  return useMutation<WhatsAppTestResult, Error, { phoneNumberId?: string; apiKey?: string } | void>({
    mutationFn: async (payload) => {
      const res = await fetch("/api/settings/whatsapp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload ?? {}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error((json as { error?: string }).error ?? "Connection test failed");
      }
      return json.data as WhatsAppTestResult;
    },
  });
}
