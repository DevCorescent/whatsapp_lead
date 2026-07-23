import { useQuery } from "@tanstack/react-query";
import type {
  ConversationStatus,
  MessageDirection,
  CampaignStatus,
} from "@prisma/client";

export interface SearchResults {
  contacts: Array<{
    id: string;
    name: string;
    phone: string;
    email: string | null;
  }>;
  leads: Array<{
    id: string;
    title: string;
    stage: { id: string; name: string; color: string } | null;
    contact: { name: string; phone: string };
  }>;
  conversations: Array<{
    id: string;
    status: ConversationStatus;
    lastMessagePreview: string | null;
    contact: { name: string; phone: string };
  }>;
  messages: Array<{
    id: string;
    conversationId: string;
    content: string | null;
    createdAt: string;
    direction: MessageDirection;
  }>;
  campaigns: Array<{
    id: string;
    name: string;
    status: CampaignStatus;
  }>;
}

export function useSearch(query: string) {
  return useQuery<SearchResults>({
    queryKey: ["search", query],
    enabled: query.trim().length >= 2,
    staleTime: 15_000,
    queryFn: async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error("Failed to search");
      const json = await res.json();
      return json.data as SearchResults;
    },
  });
}
