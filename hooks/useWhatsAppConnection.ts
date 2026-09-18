"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// ─────────────────────────────────────────────────────────────────────────────
// React Query bindings for the WhatsApp Embedded Signup endpoints.
//
// Nothing secret passes through here in either direction: the config carries an
// app id and a Facebook Login configuration id (both public by construction, and
// both needed in the page for the SDK to work at all), and the connect response
// carries ids and display names only — never the access token.
// ─────────────────────────────────────────────────────────────────────────────

/** Non-secret Embedded Signup configuration, or the reason it is unavailable. */
export interface EmbeddedSignupConfigDTO {
  enabled: boolean;
  appId?: string;
  configId?: string;
  graphVersion?: string;

  /** Server-side variables an administrator still has to set. */
  missing?: string[];
}

/** What Meta told us about the account that was just connected. */
export interface WhatsAppConnectionDTO {
  wabaId: string;
  wabaName: string | null;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  codeVerificationStatus: string | null;
}

/** Result returned by the WhatsApp connection test. */
export interface WhatsAppTestDTO {
  phoneNumberId: string;
  wabaId: string | null;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  codeVerificationStatus: string | null;
}

/**
 * A persisted WhatsApp number connected to a Business.
 *
 * This intentionally contains only non-secret fields.
 * accessToken / verifyToken / appSecret are never returned to the client.
 */
export interface WhatsAppIntegrationDTO {
  id: string;
  businessId: string;

  displayName: string | null;
  phoneNumber: string | null;

  phoneNumberId: string;
  whatsappBusinessId: string;

  qualityRating: string | null;
  codeVerificationStatus: string | null;

  isActive: boolean;
  isDefault: boolean;

  createdAt: string;
  updatedAt: string;
}

/** Response returned by GET /api/integrations/whatsapp. */
export interface WhatsAppIntegrationsDTO {
  business: {
    id: string;
    name: string;
  };
  integrations: WhatsAppIntegrationDTO[];
}

/** The payload the browser collects from Meta and hands to our server to verify. */
export interface ConnectWhatsAppInput {
  code: string;
  wabaId?: string;
  phoneNumberId?: string;
  businessId?: string;
}

async function postJson<T>(
  url: string,
  body: unknown,
  fallbackError: string,
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok || json?.success === false) {
    throw new Error(json?.error ?? fallbackError);
  }

  return json as T;
}

/**
 * Loads the public Meta Embedded Signup configuration.
 *
 * This is separate from the connected WhatsApp integrations.
 */
export function useWhatsAppSignupConfig() {
  return useQuery<EmbeddedSignupConfigDTO>({
    queryKey: ["whatsapp-signup-config"],

    queryFn: async () => {
      const res = await fetch("/api/integrations/whatsapp/config");
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          json?.error ?? "Could not load the connection settings",
        );
      }

      return json.data as EmbeddedSignupConfigDTO;
    },

    // The app id and config id change only when an administrator edits the
    // deployment's environment, so this is effectively static for a session.
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/**
 * Loads all WhatsApp numbers connected to the selected Business.
 *
 * This is the new source of truth for displaying multiple WhatsApp numbers.
 */
export function useWhatsAppIntegrations(businessId?: string) {
  return useQuery<WhatsAppIntegrationsDTO>({
    queryKey: ["whatsapp-integrations", businessId],

    queryFn: async () => {
      const query = businessId
        ? `?businessId=${encodeURIComponent(businessId)}`
        : "";

      const res = await fetch(`/api/integrations/whatsapp${query}`);
      const json = await res.json().catch(() => ({}));

      if (!res.ok || json?.success === false) {
        throw new Error(
          json?.error ?? "Could not load WhatsApp integrations",
        );
      }

      return json.data as WhatsAppIntegrationsDTO;
    },

    // Don't request integrations until a Business is available.
    enabled: Boolean(businessId),

    // Keep the UI responsive without repeatedly hitting the API.
    staleTime: 30_000,
  });
}

/**
 * Connect a WhatsApp Business account through Meta Embedded Signup.
 */
export function useConnectWhatsApp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ConnectWhatsAppInput) =>
      postJson<{
        connection: WhatsAppConnectionDTO;
        warnings: string[];
      }>(
        "/api/integrations/whatsapp/connect",
        input,
        "Could not complete the WhatsApp connection",
      ),

    onSuccess: (_result, variables) => {
      // Keep the existing cache invalidation.
      queryClient.invalidateQueries({
        queryKey: ["businesses"],
      });

      queryClient.invalidateQueries({
        queryKey: ["settings"],
      });

      // Refresh the new multi-number list.
      queryClient.invalidateQueries({
        queryKey: ["whatsapp-integrations"],
      });

      // If a specific Business was connected, refresh its integration query
      // immediately as well.
      if (variables.businessId) {
        queryClient.invalidateQueries({
          queryKey: ["whatsapp-integrations", variables.businessId],
        });
      }
    },
  });
}

/**
 * Disconnect WhatsApp.
 *
 * IMPORTANT:
 * Keep this businessId-based for now.
 * The existing API endpoint is still business-based, so changing this to
 * integrationId here would require changing the API route at the same time.
 */
export function useDisconnectWhatsApp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (businessId?: string) =>
      postJson<{ warnings: string[] }>(
        "/api/integrations/whatsapp/disconnect",
        businessId ? { businessId } : {},
        "Could not disconnect WhatsApp",
      ),

    onSuccess: (_result, businessId) => {
      // Preserve existing behaviour.
      queryClient.invalidateQueries({
        queryKey: ["businesses"],
      });

      queryClient.invalidateQueries({
        queryKey: ["settings"],
      });

      // Refresh the multi-number list.
      queryClient.invalidateQueries({
        queryKey: ["whatsapp-integrations"],
      });

      if (businessId) {
        queryClient.invalidateQueries({
          queryKey: ["whatsapp-integrations", businessId],
        });
      }
    },
  });
}

/**
 * Test the current WhatsApp connection.
 *
 * Keep this businessId-based until the test API is migrated to
 * integrationId-based operation.
 */
export function useTestWhatsAppConnection() {
  return useMutation({
    mutationFn: (businessId?: string) =>
      postJson<{ data: WhatsAppTestDTO }>(
        "/api/integrations/whatsapp/test",
        businessId ? { businessId } : {},
        "Connection test failed",
      ),
  });
}