"use client";

/** Shared types and the query for multi-document FAQ sets. */

import { useQuery } from "@tanstack/react-query";
import type { DocFaq, FaqStyle } from "@/lib/knowledgeFaq";

export interface FaqSetDoc {
  id: string;
  name: string;
  isIndexed: boolean;
}

export interface FaqSet {
  id: string;
  name: string;
  docIds: string[];
  documents: FaqSetDoc[];
  /** Ids in the set whose document has since been deleted. */
  missingDocs: number;
  faqs: DocFaq[];
  style: FaqStyle;
  truncated: boolean;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export const SETS_KEY = ["knowledge", "faq-sets"];

export function useFaqSets() {
  return useQuery<FaqSet[]>({
    queryKey: SETS_KEY,
    queryFn: async () => {
      const res = await fetch("/api/knowledge/faq-sets");
      if (!res.ok) throw new Error(`Failed to load FAQ sets (${res.status})`);
      const json = await res.json();
      return (json.data ?? []) as FaqSet[];
    },
    retry: false,
  });
}
