"use client";

// ============================================================================
// COMPONENT : BlacklistManager
//
// List, search, add and remove blacklisted numbers, plus their history. Used by
// the account page (/blacklist, scope "account") and the super-admin page
// (/admin/blacklist, scope "platform" — applies to every account).
// ============================================================================

import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Ban, CheckCircle2, History, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { Button, Card, EmptyState, Modal, SkeletonRows, inputClass } from "@/components/ui";
import { splitNumberInput } from "@/lib/broadcast";
import { cn, formatDate } from "@/lib/utils";

type Scope = "account" | "platform" | "all";

interface Entry {
  id: string;
  phone: string;
  reason: string | null;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
  contactName: string | null;
  tenantName?: string | null;
}

interface ListResponse {
  data: Entry[];
  pagination: { page: number; total: number; totalPages: number };
  canManage: boolean;
}

interface HistoryRow {
  id: string;
  action: "added" | "removed";
  phone: string;
  reason: string | null;
  note: string | null;
  by: { id: string; name: string } | null;
  at: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json as T;
}

function formatPhone(phone: string) {
  return `+${phone}`;
}

export function BlacklistManager({ scope, initialSearch = "" }: { scope: Scope; initialSearch?: string }) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"list" | "history">("list");
  const [search, setSearch] = useState(initialSearch);
  const [page, setPage] = useState(1);
  const [numbers, setNumbers] = useState("");
  const [reason, setReason] = useState("");
  const [addResult, setAddResult] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Entry | null>(null);
  const [removeNote, setRemoveNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const scopeParam = scope === "platform" ? "&scope=platform" : scope === "all" ? "&scope=all" : "";

  const list = useQuery<ListResponse>({
    queryKey: ["blacklist", scope, search.trim(), page],
    queryFn: () =>
      getJson(`/api/blacklist?page=${page}&limit=50&search=${encodeURIComponent(search.trim())}${scopeParam}`),
    placeholderData: keepPreviousData,
  });

  const history = useQuery<{ data: HistoryRow[] }>({
    queryKey: ["blacklist-history", scope],
    queryFn: () => getJson(`/api/blacklist/history?limit=200${scopeParam}`),
    enabled: view === "history",
  });

  const canManage = list.data?.canManage ?? false;
  const entered = splitNumberInput(numbers);

  const add = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/blacklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phones: entered, reason: reason.trim() || undefined, scope }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not add to the blacklist");
      return json.data as { added: string[]; alreadyListed: string[]; invalid: string[] };
    },
    onSuccess: (r) => {
      setError(null);
      setNumbers(r.invalid.join("\n"));
      setReason("");
      const parts = [`${r.added.length} added`];
      if (r.alreadyListed.length) parts.push(`${r.alreadyListed.length} already listed`);
      if (r.invalid.length) parts.push(`${r.invalid.length} invalid (left in the box)`);
      setAddResult(parts.join(" · "));
      queryClient.invalidateQueries({ queryKey: ["blacklist"] });
      queryClient.invalidateQueries({ queryKey: ["blacklist-history"] });
    },
    onError: (err: Error) => { setAddResult(null); setError(err.message); },
  });

  const remove = useMutation({
    mutationFn: async (entry: Entry) => {
      const note = removeNote.trim() ? `?note=${encodeURIComponent(removeNote.trim())}` : "";
      const res = await fetch(`/api/blacklist/${entry.id}${note}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not remove the entry");
    },
    onSuccess: () => {
      setRemoving(null);
      setRemoveNote("");
      queryClient.invalidateQueries({ queryKey: ["blacklist"] });
      queryClient.invalidateQueries({ queryKey: ["blacklist-history"] });
    },
    onError: (err: Error) => { setRemoving(null); setError(err.message); },
  });

  const entries = list.data?.data ?? [];
  const pagination = list.data?.pagination;

  return (
    <div className={cn("grid items-start gap-5", scope !== "all" && "lg:grid-cols-[minmax(0,1fr)_340px]")}>
      {/* ── List / history ── */}
      <Card className="min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div className="flex max-w-full overflow-x-auto rounded-lg bg-slate-100 p-0.5 text-sm">
            {(scope === "all" ? (["list"] as const) : (["list", "history"] as const)).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 font-medium transition",
                  view === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
                )}
              >
                {v === "list" ? <Ban className="h-3.5 w-3.5" /> : <History className="h-3.5 w-3.5" />}
                {v === "list" ? `Blocked${pagination ? ` (${pagination.total.toLocaleString()})` : ""}` : "History"}
              </button>
            ))}
          </div>
          {view === "list" && (
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className={cn(inputClass, "pl-8")}
                placeholder="Search number or reason"
                aria-label="Search the blacklist"
              />
            </div>
          )}
        </div>

        {error && (
          <p className="m-4 mb-0 flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}

        {view === "list" ? (
          list.isLoading ? (
            <div className="p-4"><SkeletonRows rows={5} /></div>
          ) : list.isError ? (
            <EmptyState icon={AlertCircle} title="Couldn't load the blacklist" description={(list.error as Error).message} />
          ) : entries.length === 0 ? (
            <EmptyState
              icon={Ban}
              title={search ? "No matching numbers" : "No blocked numbers"}
              description={
                search
                  ? "Nothing on the blacklist matches that search."
                  : scope === "platform"
                    ? "Numbers added here can't be messaged by any account on the platform."
                    : scope === "all"
                      ? "No account has blocked any numbers yet."
                      : "Numbers added here never receive a campaign, broadcast or reply from this account."
              }
            />
          ) : (
            <>
              {/* Phones: one card per number instead of the table */}
              <ul className="divide-y divide-slate-100 sm:hidden">
                {entries.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[13px] text-slate-900">{formatPhone(e.phone)}</p>
                      {e.contactName && <p className="text-xs text-slate-500">{e.contactName}</p>}
                      {scope === "all" && e.tenantName && (
                        <p className="mt-0.5 text-xs font-medium text-slate-700">{e.tenantName}</p>
                      )}
                      {e.reason && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{e.reason}</p>}
                      <p className="mt-1 text-xs text-slate-400">
                        {formatDate(e.createdAt)}
                        {e.createdBy && <> · by {e.createdBy.name}</>}
                      </p>
                    </div>
                    {canManage && (
                      <Button variant="ghost" className="shrink-0" onClick={() => setRemoving(e)} aria-label={`Unblock ${formatPhone(e.phone)}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                        Unblock
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              <div className="scrollbar-slim hidden overflow-x-auto sm:block">
                <table className="w-full min-w-xl text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Number</th>
                      {scope === "all" && <th className="px-4 py-2.5 font-medium">Account</th>}
                      <th className="px-4 py-2.5 font-medium">Reason</th>
                      <th className="px-4 py-2.5 font-medium">Added</th>
                      {canManage && <th className="px-4 py-2.5" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {entries.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5">
                          <p className="font-mono text-[13px] text-slate-900">{formatPhone(e.phone)}</p>
                          {e.contactName && <p className="text-xs text-slate-500">{e.contactName}</p>}
                        </td>
                        {scope === "all" && (
                          <td className="px-4 py-2.5 text-xs text-slate-600">
                            {e.tenantName ?? <span className="text-slate-400">—</span>}
                          </td>
                        )}
                        <td className="max-w-xs px-4 py-2.5 text-slate-600">
                          <span className="line-clamp-2">{e.reason ?? <span className="text-slate-400">—</span>}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">
                          {formatDate(e.createdAt)}
                          {e.createdBy && <span className="block">by {e.createdBy.name}</span>}
                        </td>
                        {canManage && (
                          <td className="px-4 py-2.5 text-right">
                            <Button variant="ghost" size="sm" onClick={() => setRemoving(e)} aria-label={`Unblock ${formatPhone(e.phone)}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                              Unblock
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
                  <span>Page {pagination.page} of {pagination.totalPages}</span>
                  <div className="flex gap-1">
                    <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                    <Button variant="secondary" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )
        ) : history.isLoading ? (
          <div className="p-4"><SkeletonRows rows={5} /></div>
        ) : (history.data?.data ?? []).length === 0 ? (
          <EmptyState icon={History} title="No history yet" description="Every number blocked or unblocked is recorded here." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {history.data!.data.map((h) => (
              <li key={h.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                <span
                  className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                    h.action === "added" ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600",
                  )}
                >
                  {h.action === "added" ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-slate-800">
                    <span className="font-mono text-[13px]">{h.phone ? formatPhone(h.phone) : "—"}</span>{" "}
                    {h.action === "added" ? "blocked" : "unblocked"}
                    {h.by && <span className="text-slate-500"> by {h.by.name}</span>}
                  </p>
                  {(h.reason || h.note) && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {h.reason && <>Reason: {h.reason}</>}
                      {h.reason && h.note && " · "}
                      {h.note && <>Note: {h.note}</>}
                    </p>
                  )}
                  <time className="mt-0.5 block text-xs text-slate-400 sm:hidden">{new Date(h.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</time>
                </div>
                <time className="hidden shrink-0 text-xs text-slate-400 sm:block">{new Date(h.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</time>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── Add (hidden for all-accounts view) ── */}
      {scope !== "all" && <div className="space-y-4 lg:sticky lg:top-0">
        {canManage ? (
          <Card className="p-4 sm:p-5">
            <h2 className="mb-1 text-sm font-semibold text-slate-900">Block numbers</h2>
            <p className="mb-3 text-xs text-slate-500">
              One per line. Numbers without a country code get +91.
            </p>
            <textarea
              value={numbers}
              onChange={(e) => setNumbers(e.target.value)}
              rows={6}
              spellCheck={false}
              className={cn(inputClass, "resize-y font-mono text-[13px]")}
              placeholder={"+91 98765 43210\n9123456789"}
              aria-label="Numbers to block"
            />
            <label htmlFor="bl-add-reason" className="mb-1.5 mt-3 block text-xs font-medium text-slate-600">
              Reason (optional)
            </label>
            <input
              id="bl-add-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              className={inputClass}
              placeholder="e.g. Requested no contact"
            />
            <Button className="mt-4 h-10 w-full sm:h-9" disabled={entered.length === 0 || add.isPending} onClick={() => add.mutate()}>
              {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Block {entered.length > 0 ? entered.length.toLocaleString() : ""} {entered.length === 1 ? "number" : "numbers"}
            </Button>
            {addResult && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                {addResult}
              </p>
            )}
          </Card>
        ) : (
          list.data && (
            <Card className="p-5 text-sm text-slate-600">
              You can view the blacklist. Ask an owner or admin to add or remove numbers.
            </Card>
          )
        )}
        <Card className="p-5 text-xs leading-relaxed text-slate-500">
          <p className="mb-1 font-medium text-slate-700">How blocking works</p>
          Blocked numbers are removed from every campaign and broadcast before it is sent, and any
          send to them — inbox reply, automated reply or API — is refused.
          {scope === "account" && " Numbers blocked by the platform administrator are also refused."}
          {" "}Every block and unblock is kept in History.
        </Card>
      </div>}

      <Modal
        open={!!removing}
        onClose={() => !remove.isPending && setRemoving(null)}
        title="Unblock this number?"
        description={removing ? `${formatPhone(removing.phone)} will be able to receive messages again.` : undefined}
      >
        <label htmlFor="bl-note" className="mb-1.5 block text-sm font-medium text-slate-700">
          Note <span className="font-normal text-slate-400">(optional, kept in the history)</span>
        </label>
        <input
          id="bl-note"
          value={removeNote}
          onChange={(e) => setRemoveNote(e.target.value)}
          maxLength={500}
          className={inputClass}
          placeholder="e.g. Customer asked to be contacted again"
        />
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>button]:h-10 [&>button]:w-full sm:[&>button]:h-9 sm:[&>button]:w-auto">
          <Button variant="secondary" onClick={() => setRemoving(null)} disabled={remove.isPending}>Cancel</Button>
          <Button onClick={() => removing && remove.mutate(removing)} disabled={remove.isPending}>
            {remove.isPending ? "Unblocking…" : "Unblock"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
