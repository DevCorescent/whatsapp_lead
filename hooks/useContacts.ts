// TODO [SHALMON]: React Query hooks for contacts.
//
// useContacts(filters) — GET /api/contacts with pagination + filters
// useContact(id)       — GET /api/contacts/[id]
// useCreateContact()   — POST /api/contacts (mutation)
// useUpdateContact()   — PATCH /api/contacts/[id] (mutation)
// useDeleteContact()   — DELETE /api/contacts/[id] (mutation)
//
// Use @tanstack/react-query v5 syntax (queryKey arrays, useMutation with mutationFn).
// Invalidate ["contacts"] on create/update/delete.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useContacts(filters?: { search?: string; tagId?: string; page?: number }) {
  return useQuery({
    queryKey: ["contacts", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.search) params.set("search", filters.search);
      if (filters?.tagId) params.set("tagId", filters.tagId);
      if (filters?.page) params.set("page", String(filters.page));
      const res = await fetch(`/api/contacts?${params}`);
      if (!res.ok) throw new Error("Failed to fetch contacts");
      return res.json();
    },
  });
}

export function useContact(id: string) {
  return useQuery({
    queryKey: ["contacts", id],
    queryFn: async () => {
      const res = await fetch(`/api/contacts/${id}`);
      if (!res.ok) throw new Error("Failed to fetch contact");
      return res.json();
    },
    enabled: !!id,
  });
}

// TODO [SHALMON]: Implement useCreateContact, useUpdateContact, useDeleteContact mutations
