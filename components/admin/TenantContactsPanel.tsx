"use client";

// Super admin → one account's contacts: search, filter by status, and delete /
// restore / block / unblock, one at a time or for a selection.
// Backed by /api/admin/tenants/[id]/contacts.

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, ChevronLeft, ChevronRight, Search, Trash2, Undo2 } from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminPanel,
  AdminSkeletonRows,
  AdminTable,
  Segmented,
  tdClass,
  thClass,
} from "@/components/admin/ui";
import { formatDate } from "@/lib/utils";

type Status = "active" | "blocked" | "deleted";
type Action = "delete" | "restore" | "block" | "unblock";

interface AdminContact {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  isBlocked: boolean;
  blacklisted: boolean;
  optedOut: boolean;
  createdAt: string;
  business: { name: string } | null;
}

interface ContactsPage {
  data: AdminContact[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const LIMIT = 25;

const DONE: Record<Action, string> = {
  delete: "deleted",
  restore: "restored",
  block: "blocked",
  unblock: "unblocked",
};

export function TenantContactsPanel({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("active");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isError } = useQuery<ContactsPage>({
    queryKey: ["admin", "tenant", tenantId, "contacts", status, debounced, page],
    queryFn: async () => {
      const q = new URLSearchParams({ status, page: String(page), limit: String(LIMIT) });
      if (debounced) q.set("search", debounced);
      const res = await fetch(`/api/admin/tenants/${tenantId}/contacts?${q}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to load contacts");
      return json as ContactsPage;
    },
    placeholderData: (prev) => prev,
  });

  const act = useMutation({
    mutationFn: async (vars: { action: Action; ids: string[]; reason?: string }) => {
      const res = await fetch(`/api/admin/tenants/${tenantId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to update the contacts");
      return json.data as { affected: number; platformBlocked?: number };
    },
    onSuccess: (r, vars) => {
      setSelected([]);
      setNotice(
        `${r.affected} contact${r.affected === 1 ? "" : "s"} ${DONE[vars.action]}.` +
          (r.platformBlocked ? ` ${r.platformBlocked} still blocked by the platform blacklist (Admin → Blacklist).` : ""),
      );
      queryClient.invalidateQueries({ queryKey: ["admin", "tenant", tenantId] });
    },
    onError: (err: Error) => setNotice(err.message),
  });

  function run(action: Action, ids: string[]) {
    if (ids.length === 0) return;
    const n = ids.length === 1 ? "this contact" : `${ids.length} contacts`;
    if (action === "delete" && !confirm(`Delete ${n}? They can be restored from "Deleted".`)) return;
    let reason: string | undefined;
    if (action === "block") {
      const answer = prompt(`Block ${n}? No message will be sent to them from this account.\n\nReason (optional):`);
      if (answer === null) return;
      reason = answer.trim() || undefined;
    }
    setNotice(null);
    act.mutate({ action, ids, reason });
  }

  const rows = data?.data ?? [];
  const total = data?.pagination.total ?? 0;
  const totalPages = data?.pagination.totalPages ?? 1;
  const allSelected = rows.length > 0 && rows.every((r) => selected.includes(r.id));
  const selectedRows = rows.filter((r) => selected.includes(r.id));

  return (
    <AdminPanel
      title={`Contacts (${total.toLocaleString()})`}
      subtitle="Delete, restore or block this account's contacts"
      bodyClassName="p-0 sm:p-0"
    >
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <Segmented
          options={[
            { value: "active", label: "Active" },
            { value: "blocked", label: "Blocked" },
            { value: "deleted", label: "Deleted" },
          ]}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
            setSelected([]);
          }}
        />
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
              setSelected([]);
            }}
            placeholder="Name, phone or email"
            aria-label="Search contacts"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
      </div>

      {notice && <p className="border-b border-slate-200 bg-sky-50 px-4 py-2 text-xs text-sky-800 sm:px-5">{notice}</p>}

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-emerald-50/60 px-4 py-2.5 sm:px-5">
          <span className="text-sm font-medium text-emerald-900">{selected.length} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <AdminButton size="sm" variant="secondary" disabled={act.isPending} onClick={() => run("block", selected)}>
              <Ban className="h-3.5 w-3.5" /> Block
            </AdminButton>
            {selectedRows.some((r) => r.blacklisted) && (
              <AdminButton size="sm" variant="secondary" disabled={act.isPending} onClick={() => run("unblock", selected)}>
                <Ban className="h-3.5 w-3.5" /> Unblock
              </AdminButton>
            )}
            {status === "deleted" ? (
              <AdminButton size="sm" variant="secondary" disabled={act.isPending} onClick={() => run("restore", selected)}>
                <Undo2 className="h-3.5 w-3.5" /> Restore
              </AdminButton>
            ) : (
              <AdminButton size="sm" variant="danger" disabled={act.isPending} onClick={() => run("delete", selected)}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </AdminButton>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="p-4">
          <AdminSkeletonRows rows={5} />
        </div>
      ) : isError ? (
        <p className="px-5 py-6 text-sm text-rose-700">Couldn&apos;t load contacts.</p>
      ) : rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-500">
          {status === "active" ? "No contacts" : status === "blocked" ? "No blocked numbers" : "No deleted contacts"}
          {debounced ? " match that search." : "."}
        </p>
      ) : (
        <AdminTable>
          <thead className="bg-slate-50">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  className="h-4 w-4 accent-emerald-600"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? [] : rows.map((r) => r.id))}
                />
              </th>
              <th className={thClass}>Contact</th>
              <th className={thClass}>Phone</th>
              <th className={thClass}>Business</th>
              <th className={thClass}>Status</th>
              <th className={thClass}>Added</th>
              <th className={thClass}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((c) => (
              <tr key={c.id} className={selected.includes(c.id) ? "bg-emerald-50/40" : undefined}>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={`Select ${c.name ?? c.phone}`}
                    className="h-4 w-4 accent-emerald-600"
                    checked={selected.includes(c.id)}
                    onChange={() =>
                      setSelected((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]))
                    }
                  />
                </td>
                <td className={tdClass}>
                  <span className="block font-medium text-slate-900">{c.name || "Unnamed"}</span>
                  {c.email && <span className="block text-xs text-slate-500">{c.email}</span>}
                </td>
                <td className={`${tdClass} font-mono text-xs`}>{c.phone}</td>
                <td className={tdClass}>{c.business?.name ?? "—"}</td>
                <td className={tdClass}>
                  <span className="flex flex-wrap gap-1">
                    {c.isBlocked && <AdminBadge>Deleted</AdminBadge>}
                    {c.blacklisted && <AdminBadge tone="rose">Blocked</AdminBadge>}
                    {c.optedOut && <AdminBadge tone="amber">Opted out</AdminBadge>}
                    {!c.isBlocked && !c.blacklisted && !c.optedOut && <AdminBadge tone="emerald">Active</AdminBadge>}
                  </span>
                </td>
                <td className={tdClass}>{formatDate(c.createdAt)}</td>
                <td className={`${tdClass} text-right`}>
                  <span className="inline-flex gap-1">
                    <AdminButton
                      size="sm"
                      variant="ghost"
                      disabled={act.isPending}
                      onClick={() => run(c.blacklisted ? "unblock" : "block", [c.id])}
                    >
                      <Ban className="h-3.5 w-3.5" /> {c.blacklisted ? "Unblock" : "Block"}
                    </AdminButton>
                    {c.isBlocked ? (
                      <AdminButton size="sm" variant="ghost" disabled={act.isPending} onClick={() => run("restore", [c.id])}>
                        <Undo2 className="h-3.5 w-3.5" /> Restore
                      </AdminButton>
                    ) : (
                      <AdminButton
                        size="sm"
                        variant="ghost"
                        className="text-rose-600 hover:text-rose-700"
                        disabled={act.isPending}
                        onClick={() => run("delete", [c.id])}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </AdminButton>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 sm:px-5">
          <p className="text-xs text-slate-500">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <AdminButton size="sm" variant="secondary" disabled={page <= 1} onClick={() => { setPage(page - 1); setSelected([]); }}>
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </AdminButton>
            <AdminButton size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => { setPage(page + 1); setSelected([]); }}>
              Next <ChevronRight className="h-3.5 w-3.5" />
            </AdminButton>
          </div>
        </div>
      )}
    </AdminPanel>
  );
}
